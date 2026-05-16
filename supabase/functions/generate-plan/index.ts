import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await req.json()
    const { sport, raceDistance, raceDate, startDate, trainingDaysPerWeek, goalTime, athleteProfile } = body as {
      sport: 'triathlon' | 'run' | 'bike' | 'swim'
      raceDistance: string
      raceDate: string
      startDate: string
      trainingDaysPerWeek: number
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

    const startMs = new Date(startDate + 'T00:00:00Z').getTime()
    const raceMs = new Date(raceDate + 'T00:00:00Z').getTime()
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

    const prompt = `You are an expert endurance coach. Generate a personalised training plan and return ONLY valid JSON — no explanation, no markdown, no code blocks.

Athlete:
${fitnessLines.join('\n')}

Plan:
- Sport: ${sport}
- Race: ${raceDistance}
- Race date: ${raceDate}
- Start date: ${startDate}
- Total weeks: ${totalWeeks}
- Training days/week: ${trainingDaysPerWeek}${goalTime ? `\n- Goal time: ${goalTime}` : ''}

Periodisation:
- Weeks 1–${baseWeeks}: Base — Z2 aerobic volume, 1 threshold session/week, long session Saturday or Sunday
- Weeks ${baseWeeks + 1}–${peakEnd}: Build — add intervals, race-pace work, brick sessions (triathlon); keep long session weekend
- Weeks ${peakEnd + 1}–${totalWeeks}: Taper — cut volume 40%, keep intensity, sharpen for race day
- Alternate hard/easy days. Rest on non-training days (use sport "rest").

Sport codes: swim, bike, run, sc (strength/core), brick (bike+run), rest

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
      "title": "Easy Run",
      "description": "Aerobic base run",
      "duration_minutes": 45,
      "target_metric": "Z2, <135 bpm",
      "zone_label": "Zone 2",
      "phase": "Base",
      "notes": ""
    }
  ]
}

Generate all ${totalWeeks} weeks, 7 sessions per week (one per day). Every day must appear including rest days. Keep title and notes concise.`

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
      throw new Error(`Anthropic API error ${aiRes.status}: ${errBody}`)
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
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
