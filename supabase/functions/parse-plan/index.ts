import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseAllowedOrigins, getCorsHeaders as corsHeadersFor } from '../_shared/cors.ts'
import { validateParsedPlan } from '../_shared/validatePlan.ts'
import { checkRateLimit, releaseRateLimit } from '../_shared/rateLimit.ts'
import { resolveSessionDates, flagConflicts } from '../_shared/planScheduling.ts'
import { validateParsePlanRequest } from '../_shared/parsePlanValidation.ts'
import { callClaude } from '../_shared/anthropic.ts'
import { captureError } from '../_shared/errorTracking.ts'
import type { Database } from '../_shared/database.types.ts'

// ── Contract ─────────────────────────────────────────────────────────────────
// POST, Authorization: Bearer <supabase JWT>
// Body: ParsePlanRequest (see _shared/parsePlanValidation.ts) —
//   { content: string (max 80000 chars), contentType: 'pdf'|'html'|'text',
//     startDate?, raceDate?, planName? }
//   - content is the already-extracted plain text of the uploaded plan (PDF text extraction
//     happens client-side via pdfjs-dist before this function is called)
// Success 200: { plan_name, race_name, total_weeks, sessions: ResolvedSession[], conflict_count }
//   - sessions have scheduled_date resolved from week/day_of_week and has_conflict flagged
//     against the user's existing workouts (see _shared/planScheduling.ts)
// Errors:
//   401 { error: 'Missing authorization header' | 'Not authenticated' }
//   429 { error: 'Rate limit exceeded...' }                     — >5 imports/hr
//   400 { error: <validation message> }                         — bad request body (see
//                                                                    validateParsePlanRequest)
//   400 { error: 'parse_failed' }                                — Claude's output wasn't usable
//                                                                    JSON matching the plan shape
//   504 { error: 'Plan parsing took too long...', requestId }   — Claude call exceeded 30s
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
    if (!authHeader?.startsWith('Bearer ')) {
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
    const allowed = await checkRateLimit(user.id, 'parse-plan', RATE_LIMIT, RATE_WINDOW_MS)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. You can import up to 5 plans per hour.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Parse + validate body ─────────────────────────────────────────────────
    const rawBody: unknown = await req.json()
    const validation = validateParsePlanRequest(rawBody)
    if (!validation.ok) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { content, contentType, startDate, raceDate, planName } = validation.value

    // ── Call Claude ───────────────────────────────────────────────────────────
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

    // Calls Claude and turns its output into a validated plan. If the call fails outright,
    // times out, or produces output that can't be turned into a usable plan, refunds the
    // rate-limit slot checkRateLimit already reserved — none of those outcomes gave the
    // athlete a usable import, so they shouldn't cost part of their hourly quota. Returns a
    // Response directly for the parse-failure case (preserving the existing 400 behaviour) so
    // the caller can tell "give up, respond now" apart from "here's a usable plan" without a
    // variable that's nullable across the try/catch boundary. A failure further down in the
    // handler (conflict-detection DB read) happens after Claude already produced a usable
    // plan, so it deliberately isn't covered by this function and won't refund.
    async function parsePlanFromClaude(): Promise<{ parsed: NonNullable<ReturnType<typeof validateParsedPlan>> } | Response> {
      try {
        const rawText = await callClaude(prompt, 8192, 'parse-plan')

        // ── Strip markdown wrappers ───────────────────────────────────────────
        const jsonStr = rawText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/, '')
          .trim()

        let rawParsed: unknown
        try {
          rawParsed = JSON.parse(jsonStr)
        } catch {
          console.error('[parse-plan] JSON parse failed. Raw text:', rawText.slice(0, 500))
          await releaseRateLimit(user.id, 'parse-plan')
          return new Response(JSON.stringify({ error: 'parse_failed' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const parsed = validateParsedPlan(rawParsed)
        if (!parsed) {
          console.error('[parse-plan] Parsed JSON failed shape validation. Raw text:', rawText.slice(0, 500))
          await releaseRateLimit(user.id, 'parse-plan')
          return new Response(JSON.stringify({ error: 'parse_failed' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        return { parsed }
      } catch (claudeErr) {
        await releaseRateLimit(user.id, 'parse-plan')
        throw claudeErr
      }
    }

    const claudeResult = await parsePlanFromClaude()
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
    console.error(`[parse-plan] request ${requestId} user ${userId ?? 'unauthenticated'} failed:`, message)
    captureError(err, { requestId, userId, function: 'parse-plan' })

    if (err instanceof Error && err.name === 'AbortError') {
      return new Response(
        JSON.stringify({ error: 'Plan parsing took too long. Please try again.', requestId }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ error: 'An internal error occurred. Please try again.', requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
