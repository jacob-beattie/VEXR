import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseAllowedOrigins, getCorsHeaders as corsHeadersFor } from '../_shared/cors.ts'
import { checkRateLimit, releaseRateLimit } from '../_shared/rateLimit.ts'
import { calculatePMC } from '../_shared/calculatePMC.ts'
import { callClaude } from '../_shared/anthropic.ts'
import type { Database } from '../_shared/database.types.ts'

const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGIN'))

function getCorsHeaders(req: Request): Record<string, string> {
  return corsHeadersFor(req.headers.get('Origin') ?? '', ALLOWED_ORIGINS)
}

const BRIEFING_RATE_LIMIT = 5

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const requestId = crypto.randomUUID()
  let userId: string | null = null

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient<Database>(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    userId = user.id

    // Parse body
    let force = false
    try {
      const body = await req.json()
      force = body?.force === true
    } catch { /* no body or non-JSON — fine */ }

    // Check for a cached briefing from the last 24 hours (unless force)
    if (!force) {
      const { data: cached } = await supabase
        .from('ai_briefings')
        .select('briefing, generated_at')
        .eq('user_id', user.id)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()

      if (cached) {
        const age = Date.now() - new Date(cached.generated_at).getTime()
        if (age < 24 * 60 * 60 * 1000) {
          return new Response(
            JSON.stringify({ briefing: cached.briefing, generated_at: cached.generated_at, cached: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
      }
    }

    // ── Rate limit briefing API calls (cache misses + force refreshes) ────────
    const allowed = await checkRateLimit(user.id, 'ai-briefing', BRIEFING_RATE_LIMIT)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please wait before refreshing your briefing.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch user's profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, sport, ftp, run_pace, css, race_goal, race_date')
      .eq('id', user.id)
      .single()

    // Fetch last 42 days of workouts
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 42)
    const { data: workouts, error: workoutsError } = await supabase
      .from('workouts')
      .select('date, tss, planned, type, title, duration_minutes')
      .eq('user_id', user.id)
      .gte('date', cutoff.toISOString().split('T')[0])
      .order('date', { ascending: false })

    if (workoutsError) throw workoutsError

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { current: { ctl, atl, tsb } } = calculatePMC(workouts ?? [], today, today)

    // This week's TSS
    const dow = today.getDay()
    const diff = dow === 0 ? -6 : 1 - dow
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() + diff)
    const weekWorkouts = (workouts ?? []).filter(w => {
      const d = new Date(w.date + 'T00:00:00')
      return !w.planned && d >= weekStart && d <= today
    })
    const weekTSS = weekWorkouts.reduce((s, w) => s + (w.tss || 0), 0)
    const weekSessions = weekWorkouts.length

    // Last 7 days completed workouts
    const last7Start = new Date(today.getTime() - 6 * 86400000)
    const recent = (workouts ?? [])
      .filter(w => !w.planned && new Date(w.date + 'T00:00:00') >= last7Start)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const recentSummary = recent.map(w => {
      const dur = w.duration_minutes ? `${Math.round(w.duration_minutes)}min` : ''
      const tss = w.tss ? `${w.tss}TSS` : ''
      return `${w.date.split('T')[0]} ${w.type} "${w.title}" ${[dur, tss].filter(Boolean).join(' ')}`
    }).join('\n')

    // Upcoming planned workouts
    const tomorrow = new Date(today.getTime() + 86400000)
    const upcoming = (workouts ?? [])
      .filter(w => w.planned && new Date(w.date + 'T00:00:00') >= tomorrow)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5)
      .map(w => `${w.date.split('T')[0]} ${w.type} "${w.title}" ${w.tss ? `${w.tss}TSS` : ''}`)
      .join('\n')

    const raceInfo = profile?.race_goal && profile?.race_date
      ? `Race goal: ${profile.race_goal} on ${profile.race_date} (${Math.ceil((new Date(profile.race_date + 'T00:00:00').getTime() - today.getTime()) / 86400000)} days away)`
      : 'No race goal set'

    const prompt = `You are an expert endurance coach giving a brief, personalised weekly training briefing.

Athlete: ${profile?.name || 'Athlete'}
Primary sport: ${profile?.sport || 'triathlon'}
${profile?.ftp ? `FTP: ${profile.ftp}W` : ''}${profile?.run_pace ? ` | Run threshold pace: ${profile.run_pace}/km` : ''}

Current fitness metrics (Performance Management Chart):
- CTL (Fitness): ${ctl} — higher = more fitness built up
- ATL (Fatigue): ${atl} — higher = more fatigued
- TSB (Form): ${tsb} — positive = fresh, negative = fatigued
- This week: ${weekSessions} sessions, ${weekTSS} TSS

Last 7 days of training:
${recentSummary || 'No workouts logged in the last 7 days'}

${upcoming ? `Upcoming planned workouts:\n${upcoming}` : 'No planned workouts ahead'}

${raceInfo}

Write a concise weekly briefing (4–6 sentences max). Cover:
1. How their fitness and fatigue look right now
2. One specific, actionable recommendation for the week ahead
3. If they have a race, note if they should be tapering or building

Be direct, data-driven, and encouraging. Use plain text — no markdown, no bullet points. Address the athlete directly as "you".`

    // Wrapped separately from the outer handler try/catch: only a failure to get a usable
    // briefing out of Claude should refund the rate-limit slot. A later failure (saving to
    // ai_briefings, pruning) happens after Claude already succeeded, so it must not refund —
    // the Anthropic API cost was already incurred.
    let briefing = ''
    try {
      briefing = await callClaude(prompt, 500, 'ai-briefing')
      if (!briefing) throw new Error('Empty response from AI service')
    } catch (claudeErr) {
      await releaseRateLimit(user.id, 'ai-briefing')
      throw claudeErr
    }

    // Insert new briefing (accumulate history)
    const { data: saved, error: saveError } = await supabase
      .from('ai_briefings')
      .insert({ user_id: user.id, briefing })
      .select('generated_at')
      .single()

    if (saveError) throw saveError

    // Prune: keep only the 9 most recent briefings for this user
    const { data: allBriefings } = await supabase
      .from('ai_briefings')
      .select('id, generated_at')
      .eq('user_id', user.id)
      .order('generated_at', { ascending: false })

    if (allBriefings && allBriefings.length > 9) {
      const toDelete = allBriefings.slice(9).map((r: { id: string }) => r.id)
      await supabase.from('ai_briefings').delete().in('id', toDelete)
    }

    return new Response(
      JSON.stringify({ briefing, generated_at: saved.generated_at, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ai-briefing] request ${requestId} user ${userId ?? 'unauthenticated'} failed:`, message)

    if (err instanceof Error && err.name === 'AbortError') {
      return new Response(
        JSON.stringify({ error: 'The AI coach took too long to respond. Please try again.', requestId }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ error: 'An internal error occurred. Please try again.', requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
