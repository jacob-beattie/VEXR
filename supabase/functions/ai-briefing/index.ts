import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── PMC constants (mirrors src/lib/calculateMetrics.ts) ─────────────────────
const CTL_K = 1 - Math.exp(-1 / 42)
const ATL_K = 1 - Math.exp(-1 / 7)

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Workout {
  date: string
  tss: number | null
  planned: boolean
  type: string
  title: string
  duration_minutes: number | null
}

function calculateCTLATL(workouts: Workout[], today: Date): { ctl: number; atl: number; tsb: number } {
  const tssByDay: Record<string, number> = {}
  for (const w of workouts) {
    if (w.planned) continue
    const key = w.date.split('T')[0]
    tssByDay[key] = (tssByDay[key] || 0) + (w.tss || 0)
  }

  const allDates = Object.keys(tssByDay).sort()
  if (allDates.length === 0) return { ctl: 0, atl: 0, tsb: 0 }

  const warmupStart = new Date(allDates[0] + 'T00:00:00')
  let ctl = 0
  let atl = 0
  const totalDays = Math.round((today.getTime() - warmupStart.getTime()) / 86400000)

  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(warmupStart.getTime() + i * 86400000)
    const key = localDateKey(d)
    const tss = tssByDay[key] || 0
    ctl = ctl + CTL_K * (tss - ctl)
    atl = atl + ATL_K * (tss - atl)
  }

  return {
    ctl: Math.round(ctl),
    atl: Math.round(atl),
    tsb: Math.round(ctl - atl),
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Not authenticated')

    // Parse body
    let force = false
    let mode = 'briefing'
    let raceBody: Record<string, unknown> = {}
    try {
      const body = await req.json()
      force = body?.force === true
      mode = body?.mode ?? 'briefing'
      raceBody = body ?? {}
    } catch { /* no body or non-JSON — fine */ }

    // ── Race predictor mode ──────────────────────────────────────────────────
    if (mode === 'race_predictor') {
      const { ctl, ftp, runPace, css, sport, predictions } = raceBody as {
        ctl: number; ftp: number; runPace: string; css: string
        sport: string
        predictions: { running: string; cycling: string; swimming: string; triathlon: string }
      }

      const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

      const racePrompt = `You are an expert endurance coach. Based on an athlete's predicted race finish times and current fitness metrics, write a short personalised analysis (3–4 sentences). Be direct, specific, and encouraging. Use plain text only — no markdown, no bullets. Address the athlete as "you".

Athlete primary sport: ${sport}
Current CTL (fitness): ${ctl}
${ftp ? `FTP: ${ftp}W` : ''}${runPace ? ` | Run threshold pace: ${runPace}/km` : ''}${css ? ` | CSS: ${css}/100m` : ''}

Predicted finish times:
Running: ${predictions?.running || 'No data'}
Cycling: ${predictions?.cycling || 'No data'}
Swimming: ${predictions?.swimming || 'No data'}
Triathlon: ${predictions?.triathlon || 'No data'}

Comment on what the predictions reveal about their current fitness, highlight one standout result or area to work on, and suggest one specific training focus to improve their predicted times.`

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          messages: [{ role: 'user', content: racePrompt }],
        }),
      })

      if (!aiRes.ok) {
        const errBody = await aiRes.text()
        throw new Error(`Anthropic API error ${aiRes.status}: ${errBody}`)
      }

      const aiData = await aiRes.json()
      const narrative = aiData.content?.[0]?.text?.trim()
      if (!narrative) throw new Error('Empty response from Claude')

      return new Response(
        JSON.stringify({ narrative }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

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

    const { ctl, atl, tsb } = calculateCTLATL(workouts ?? [], today)

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

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!aiRes.ok) {
      const errBody = await aiRes.text()
      throw new Error(`Anthropic API error ${aiRes.status}: ${errBody}`)
    }

    const aiData = await aiRes.json()
    const briefing = aiData.content?.[0]?.text?.trim()
    if (!briefing) throw new Error('Empty response from Claude')

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
    const message = err instanceof Error
      ? err.message
      : (err && typeof err === 'object' ? JSON.stringify(err) : String(err))
    console.error('[ai-briefing] error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
