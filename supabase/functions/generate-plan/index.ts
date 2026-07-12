import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseAllowedOrigins, getCorsHeaders as corsHeadersFor } from '../_shared/cors.ts'
import { validateParsedPlan } from '../_shared/validatePlan.ts'
import { checkRateLimit, releaseRateLimit } from '../_shared/rateLimit.ts'
import { resolveSessionDates, flagConflicts, computeTotalWeeks, computePlanPhases } from '../_shared/planScheduling.ts'
import { validateGeneratePlanRequest } from '../_shared/generatePlanValidation.ts'
import { callClaude } from '../_shared/anthropic.ts'
import type { Database } from '../_shared/database.types.ts'

// ── Contract ─────────────────────────────────────────────────────────────────
// POST, Authorization: Bearer <supabase JWT>
// Body: GeneratePlanRequest (see _shared/generatePlanValidation.ts) —
//   { sport, raceDistance, raceDate, startDate, preferredDays?: string[], level?, goalTime?,
//     athleteProfile: { ctl, ftp?, thresholdPace?, css?, primarySport } }
// Success 200: { plan_name, race_name, total_weeks, sessions: ResolvedSession[], conflict_count }
//   - sessions have scheduled_date resolved from week/day_of_week and has_conflict flagged
//     against the user's existing workouts (see _shared/planScheduling.ts)
// Errors:
//   401 { error: 'Missing authorization header' | 'Not authenticated' }
//   429 { error: 'Rate limit exceeded...' }                     — >5 generations/hr
//   400 { error: <validation message> }                         — bad request body (see
//                                                                    validateGeneratePlanRequest)
//   400 { error: 'parse_failed' }                                — Claude's output wasn't usable
//                                                                    JSON matching the plan shape
//   504 { error: 'Plan generation took too long...', requestId } — Claude call exceeded 30s
//   500 { error: 'An internal error occurred...', requestId }    — any other failure

const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGIN'))

function getCorsHeaders(req: Request): Record<string, string> {
  return corsHeadersFor(req.headers.get('Origin') ?? '', ALLOWED_ORIGINS)
}

const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60 * 60 * 1000

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const requestId = crypto.randomUUID()
  let userId: string | null = null

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient<Database>(
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
    userId = user.id

    // ── Rate limit ────────────────────────────────────────────────────────────
    const allowed = await checkRateLimit(user.id, 'generate-plan', RATE_LIMIT, RATE_WINDOW_MS)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. You can generate up to 5 plans per hour.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Parse + validate body ─────────────────────────────────────────────────
    const rawBody: unknown = await req.json()
    const validation = validateGeneratePlanRequest(rawBody)
    if (!validation.ok) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { sport, raceDistance, raceDate, startDate, preferredDays, level, goalTime, athleteProfile } = validation.value

    const totalWeeks = computeTotalWeeks(startDate, raceDate)
    const { baseWeeks, peakEnd } = computePlanPhases(totalWeeks)

    // ── Build prompt ──────────────────────────────────────────────────────────
    const fitnessLines: string[] = [`CTL: ${athleteProfile.ctl}`]
    if (athleteProfile.ftp) fitnessLines.push(`FTP: ${athleteProfile.ftp}W`)
    if (athleteProfile.thresholdPace) fitnessLines.push(`Run threshold pace: ${athleteProfile.thresholdPace} min/km`)
    if (athleteProfile.css) fitnessLines.push(`Swim CSS: ${athleteProfile.css} /100m`)

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

    // Calls Claude and turns its output into a validated plan. If the call fails outright,
    // times out, or produces output that can't be turned into a usable plan, refunds the
    // rate-limit slot checkRateLimit already reserved — none of those outcomes gave the
    // athlete a plan, so they shouldn't cost part of their hourly quota. Returns a Response
    // directly for the parse-failure case (preserving the existing 400 behaviour) so the
    // caller can tell "give up, respond now" apart from "here's a usable plan" without a
    // variable that's nullable across the try/catch boundary. A failure further down in the
    // handler (conflict-detection DB read) happens after Claude already produced a usable
    // plan, so it deliberately isn't covered by this function and won't refund.
    async function generatePlanFromClaude(): Promise<{ parsed: NonNullable<ReturnType<typeof validateParsedPlan>> } | Response> {
      try {
        const rawText = await callClaude(prompt, 8000, 'generate-plan')

        // ── Strip markdown wrappers ───────────────────────────────────────────
        const jsonStr = rawText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/, '')
          .trim()

        let rawParsed: unknown
        try {
          rawParsed = JSON.parse(jsonStr)
        } catch {
          console.error('[generate-plan] JSON parse failed. Raw:', rawText.slice(0, 500))
          await releaseRateLimit(user.id, 'generate-plan')
          return new Response(JSON.stringify({ error: 'parse_failed' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const parsed = validateParsedPlan(rawParsed)
        if (!parsed) {
          console.error('[generate-plan] Parsed JSON failed shape validation. Raw:', rawText.slice(0, 500))
          await releaseRateLimit(user.id, 'generate-plan')
          return new Response(JSON.stringify({ error: 'parse_failed' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        return { parsed }
      } catch (claudeErr) {
        await releaseRateLimit(user.id, 'generate-plan')
        throw claudeErr
      }
    }

    const claudeResult = await generatePlanFromClaude()
    if (claudeResult instanceof Response) return claudeResult
    const { parsed } = claudeResult

    const rawSessions = parsed.sessions

    // ── Resolve scheduled dates ───────────────────────────────────────────────
    let resolvedSessions = resolveSessionDates(rawSessions, startDate)

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
        resolvedSessions = flagConflicts(resolvedSessions, conflictingWorkouts.map((w: { date: string }) => w.date))
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
    console.error(`[generate-plan] request ${requestId} user ${userId ?? 'unauthenticated'} failed:`, message)

    if (err instanceof Error && err.name === 'AbortError') {
      return new Response(
        JSON.stringify({ error: 'Plan generation took too long. Please try again.', requestId }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ error: 'An internal error occurred. Please try again.', requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
