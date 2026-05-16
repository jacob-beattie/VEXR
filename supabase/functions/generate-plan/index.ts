import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_SPORTS = ['triathlon', 'run', 'bike', 'swim'] as const
const VALID_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
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
    .eq('function_name', 'generate-plan')
    .gte('called_at', windowStart)
  if ((count ?? 0) >= RATE_LIMIT) return false
  await supabase.from('api_rate_limits').insert({ user_id: userId, function_name: 'generate-plan' })
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
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. You can generate up to 5 plans per hour.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Parse + validate body ─────────────────────────────────────────────────
    const body = await req.json()
    const { sport, raceDistance, raceDate, startDate, preferredDays, level, goalTime, athleteProfile } = body as {
      sport: string
      raceDistance: string
      raceDate: string
      startDate: string
      preferredDays?: string[]
      level?: string
      goalTime?: string
      athleteProfile: {
        ctl: number
        ftp?: number
        thresholdPace?: string
        css?: string
        primarySport: string
      }
    }

    if (!sport || !raceDistance || !raceDate || !startDate) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!(VALID_SPORTS as readonly string[]).includes(sport)) {
      return new Response(JSON.stringify({ error: 'Invalid sport' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (typeof raceDistance !== 'string' || raceDistance.length === 0 || raceDistance.length > 100) {
      return new Response(JSON.stringify({ error: 'Invalid race distance' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (level !== undefined && !(VALID_LEVELS as readonly string[]).includes(level)) {
      return new Response(JSON.stringify({ error: 'Invalid level' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const startMs = Date.parse(startDate)
    const raceMs = Date.parse(raceDate)
    if (isNaN(startMs) || isNaN(raceMs)) {
      return new Response(JSON.stringify({ error: 'Invalid date format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (raceMs <= startMs) {
      return new Response(JSON.stringify({ error: 'Race date must be after start date' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const totalWeeks = Math.max(1, Math.round((raceMs - startMs) / (7 * 86400000)))

    const baseWeeks = Math.round(totalWeeks * 0.55)
    const buildWeeks = Math.round(totalWeeks * 0.3)
    const peakEnd = baseWeeks + buildWeeks
    const taperWeeks = Math.max(1, totalWeeks - peakEnd)

    // ── Build prompt ──────────────────────────────────────────────────────────
    const fitnessLines: string[] = [`CTL: ${athleteProfile.ctl}`]
    if (athleteProfile.ftp) fitnessLines.push(`FTP: ${athleteProfile.ftp}W`)
    if (athleteProfile.thresholdPace) fitnessLines.push(`Run threshold pace: ${athleteProfile.thresholdPace} min/km`)
    if (athleteProfile.css) fitnessLines.push(`Swim CSS: ${athleteProfile.css} /100m`)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

    const availableDaysLine = preferredDays && preferredDays.length > 0
      ? preferredDays.join(', ')
      : 'any day'

    const athleteLevel = level ?? 'intermediate'

    const levelGuidance: Record<string, string> = {
      beginner: 'Beginner: mostly Z1–Z2 aerobic work; no more than 1 harder session/week; sessions capped at 60–75 min; conservative volume progression (5–8% per week); prioritise consistency and injury prevention over intensity.',
      intermediate: 'Intermediate: 1–2 quality sessions/week (threshold or intervals); long sessions up to 90 min; standard 10% volume progression; mix of aerobic base and race-specific work.',
      advanced: 'Advanced: 2–3 quality sessions/week; long sessions 90–150 min; aggressive periodisation; VO2max and race-pace work in build phase; athlete can handle high TSS weeks.',
    }

    const prompt = `You are an expert endurance coach writing a personalised training plan. Return ONLY valid JSON — no explanation, no markdown, no code blocks.

Athlete:
${fitnessLines.join('\n')}
Experience level: ${athleteLevel}

Level guidance: ${levelGuidance[athleteLevel]}

Plan:
- Sport: ${sport}
- Race: ${raceDistance}
- Race date: ${raceDate}
- Start date: ${startDate}
- Total weeks: ${totalWeeks}
- Athlete is available to train on: ${availableDaysLine}${goalTime ? `\n- Goal time: ${goalTime}` : ''}
- Sessions per week: choose the appropriate number based on the athlete's experience level, sport, and race distance. Vary the count by phase — fewer in recovery/taper weeks, more in build/peak.${sport === 'triathlon' ? ' For triathlon, double-session days (AM + PM on the same day) are normal and expected for intermediate/advanced athletes.' : ''}

Periodisation:
- Weeks 1–${baseWeeks}: Base — Z2 aerobic volume, 1 threshold session/week, long session on the latest available day of the week
- Weeks ${baseWeeks + 1}–${peakEnd}: Build — add intervals, race-pace work, brick sessions (triathlon); keep long session on latest available day of week
- Weeks ${peakEnd + 1}–${totalWeeks}: Taper — cut volume 40%, keep intensity, sharpen for race day
- Sessions MUST only fall on the athlete's available days. Not every available day needs a session. All other days use sport "rest".

Sport codes: swim, bike, run, sc (strength/core), brick (bike+run), rest

For every non-rest session, write a coach-quality "description" using this compact format (keep each description under 60 words):
"WU: [duration + effort]. Main: [specific reps/duration/pace/power]. CD: [duration + effort]. Tip: [one beginner tip]."

Use real numbers. Don't say "threshold pace" — say "threshold pace (${athleteProfile.thresholdPace ? athleteProfile.thresholdPace + ' min/km' : 'your goal race pace'})". Don't say "easy effort" — say "conversational pace, HR under 75% max".

Example: "WU: 10min easy jog (conversational). Main: 4×8min at threshold pace (4:15/km) w/ 3min jog recovery. CD: 10min easy. Tip: drop to 3 reps if pace slips — quality over volume."

Return exactly this JSON structure:
{
  "plan_name": "string",
  "total_weeks": ${totalWeeks},
  "races": [{"name": "${raceDistance} ${sport}", "date": "${raceDate}"}],
  "sessions": [
    {
      "week": 1,
      "day_of_week": "Monday",
      "time_of_day": "AM",
      "sport": "run",
      "title": "Threshold Run",
      "description": "WU: 10min easy jog. Main: 4×8min at threshold pace (4:15/km) w/ 3min jog recovery. CD: 10min easy. Tip: drop to 3 reps if pace falls apart.",
      "duration_minutes": 60,
      "target_metric": "Z4, threshold pace",
      "zone_label": "Zone 4",
      "phase": "Base",
      "notes": ""
    }
  ]
}

Generate all ${totalWeeks} weeks. Every day must appear. ${sport === 'triathlon' ? 'Multiple sessions on the same day are allowed — output them as separate entries with the same week and day_of_week but different time_of_day ("AM"/"PM"). Rest days have a single entry with sport "rest".' : 'One entry per day (one per day_of_week).'} Rest day description = "".`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!aiRes.ok) {
      const errBody = await aiRes.text()
      console.error('[generate-plan] Anthropic error:', aiRes.status, errBody.slice(0, 200))
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
      console.error('[generate-plan] JSON parse failed. Raw:', rawText.slice(0, 500))
      return new Response(JSON.stringify({ error: 'parse_failed' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rawSessions: RawSession[] = parsed.sessions ?? []

    // ── Resolve scheduled dates ───────────────────────────────────────────────
    const resolvedSessions = rawSessions.map(s => ({
      ...s,
      scheduled_date: s.day_of_week ? resolveDate(startDate, s.week, s.day_of_week) : null,
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
    const planName = parsed.plan_name || `${raceDistance} ${sport} Plan`

    return new Response(
      JSON.stringify({
        plan_name: planName,
        race_name: raceName,
        total_weeks: totalWeeks,
        sessions: resolvedSessions,
        conflict_count: conflictCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[generate-plan] error:', message)
    return new Response(
      JSON.stringify({ error: 'An internal error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
