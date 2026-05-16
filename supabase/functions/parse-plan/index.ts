import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_CONTENT_TYPES = ['pdf', 'html', 'text'] as const
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60 * 60 * 1000

const DAY_OFFSETS: Record<string, number> = {
  Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3,
  Friday: 4, Saturday: 5, Sunday: 6,
}

function resolveDate(startDate: string, week: number, dayOfWeek: string): string {
  const start = new Date(startDate + 'T00:00:00Z')
  const weekOffset = (week - 1) * 7
  const dayOffset = DAY_OFFSETS[dayOfWeek] ?? 0
  const resolved = new Date(start.getTime() + (weekOffset + dayOffset) * 86400000)
  return resolved.toISOString().split('T')[0]
}

interface RawSession {
  week: number
  day_of_week: string
  time_of_day: string
  sport: string
  title: string
  description: string
  duration_minutes: number | null
  target_metric: string
  zone_label: string
  phase: string
  notes: string
}

type SupabaseClient = ReturnType<typeof createClient>

async function checkRateLimit(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count } = await supabase
    .from('api_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('function_name', 'parse-plan')
    .gte('called_at', windowStart)
  if ((count ?? 0) >= RATE_LIMIT) return false
  await supabase.from('api_rate_limits').insert({ user_id: userId, function_name: 'parse-plan' })
  return true
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Rate limit ────────────────────────────────────────────────────────────
    const allowed = await checkRateLimit(supabase, user.id)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. You can import up to 5 plans per hour.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Parse + validate body ─────────────────────────────────────────────────
    const body = await req.json()
    const { content, contentType, startDate, raceDate, planName } = body as {
      content: string
      contentType: string
      startDate: string
      raceDate: string
      planName?: string
    }

    if (!content || typeof content !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing content' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (content.length > 80000) {
      return new Response(JSON.stringify({ error: 'content_too_large' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!(VALID_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      return new Response(JSON.stringify({ error: 'Invalid content type' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (startDate && isNaN(Date.parse(startDate))) {
      return new Response(JSON.stringify({ error: 'Invalid start date format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (raceDate && isNaN(Date.parse(raceDate))) {
      return new Response(JSON.stringify({ error: 'Invalid race date format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Call Claude ───────────────────────────────────────────────────────────
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

    const prompt = `You are a training plan parser. Extract all training sessions from the plan text below and return ONLY valid JSON. No explanation, no markdown, no code blocks — just raw JSON.

Return this exact structure:
{
  "plan_name": "string — infer from text, or use 'Training Plan'",
  "total_weeks": number,
  "races": [{"name": "string", "date": "YYYY-MM-DD or empty string"}],
  "sessions": [
    {
      "week": 1,
      "day_of_week": "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday",
      "time_of_day": "AM|PM|",
      "sport": "swim|bike|run|sc|brick|rest",
      "title": "string",
      "description": "string",
      "duration_minutes": number or null,
      "target_metric": "string — power zone, pace zone, HR zone, RPE, etc.",
      "zone_label": "string",
      "phase": "string",
      "notes": "string"
    }
  ]
}

Sport codes:
- swim = swimming
- bike = cycling/riding
- run = running
- sc = strength, conditioning, gym, yoga, core, weights
- brick = combined bike+run or multi-sport
- rest = rest days, recovery, off

Rules:
- week numbers start at 1
- duration_minutes is a number (not a string), null if unknown
- Include all sessions including rest days
- target_metric captures the key training target (e.g. "185-215w", "5:20-5:45/km", "Z2", "RPE 6-7")

Plan context:
Start date: ${startDate || 'not specified'}
Race date: ${raceDate || 'not specified'}
${planName ? `Plan name: ${planName}` : ''}
Content type: ${contentType}

Plan text:
${content}`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!aiRes.ok) {
      const errBody = await aiRes.text()
      console.error('[parse-plan] Anthropic error:', aiRes.status, errBody.slice(0, 200))
      throw new Error('AI service error')
    }

    const aiData = await aiRes.json()
    const rawText = aiData.content?.[0]?.text?.trim() ?? ''

    // ── Strip markdown wrappers ───────────────────────────────────────────────
    const jsonStr = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim()

    let parsed: { plan_name: string; total_weeks: number; races: Array<{ name: string; date: string }>; sessions: RawSession[] }
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      console.error('[parse-plan] JSON parse failed. Raw text:', rawText.slice(0, 500))
      return new Response(JSON.stringify({ error: 'parse_failed' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rawSessions: RawSession[] = parsed.sessions ?? []

    // ── Resolve scheduled dates ───────────────────────────────────────────────
    const resolvedSessions = rawSessions.map(s => ({
      ...s,
      scheduled_date: startDate && s.day_of_week
        ? resolveDate(startDate, s.week, s.day_of_week)
        : null,
      has_conflict: false,
    }))

    // ── Conflict detection ────────────────────────────────────────────────────
    const datesToCheck = resolvedSessions
      .map(s => s.scheduled_date)
      .filter((d): d is string => d !== null)

    if (datesToCheck.length > 0) {
      const { data: conflictingWorkouts } = await supabase
        .from('workouts')
        .select('date')
        .eq('user_id', user.id)
        .in('date', datesToCheck)

      if (conflictingWorkouts && conflictingWorkouts.length > 0) {
        const conflictSet = new Set(conflictingWorkouts.map((w: { date: string }) => w.date))
        for (const s of resolvedSessions) {
          if (s.scheduled_date && conflictSet.has(s.scheduled_date)) {
            s.has_conflict = true
          }
        }
      }
    }

    const conflictCount = resolvedSessions.filter(s => s.has_conflict).length
    const raceName = parsed.races?.[0]?.name ?? null
    const resolvedPlanName = planName || parsed.plan_name || 'Training Plan'

    return new Response(
      JSON.stringify({
        plan_name: resolvedPlanName,
        race_name: raceName,
        total_weeks: parsed.total_weeks ?? Math.max(...resolvedSessions.map(s => s.week), 1),
        sessions: resolvedSessions,
        conflict_count: conflictCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[parse-plan] error:', message)
    return new Response(
      JSON.stringify({ error: 'An internal error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
