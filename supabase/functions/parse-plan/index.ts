import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseAllowedOrigins, getCorsHeaders as corsHeadersFor } from '../_shared/cors.ts'
import { validateParsedPlan } from '../_shared/validatePlan.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'
import type { Database } from '../_shared/database.types.ts'

const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGIN'))

function getCorsHeaders(req: Request): Record<string, string> {
  return corsHeadersFor(req.headers.get('Origin') ?? '', ALLOWED_ORIGINS)
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

interface ParsePlanRequest {
  content: string
  contentType: string
  startDate?: string
  raceDate?: string
  planName?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Narrows the raw request body field-by-field instead of a blind `as` cast — this is the
// network trust boundary, so a wrong-typed field must fail here rather than reach the Claude
// prompt or resolveDate() unchecked.
function parseRequestBody(body: unknown): ParsePlanRequest | null {
  if (!isRecord(body)) return null
  if (typeof body.content !== 'string') return null
  if (typeof body.contentType !== 'string') return null

  return {
    content: body.content,
    contentType: body.contentType,
    startDate: typeof body.startDate === 'string' ? body.startDate : undefined,
    raceDate: typeof body.raceDate === 'string' ? body.raceDate : undefined,
    planName: typeof body.planName === 'string' ? body.planName : undefined,
  }
}

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
    const allowed = await checkRateLimit(user.id, 'parse-plan', RATE_LIMIT, RATE_WINDOW_MS)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. You can import up to 5 plans per hour.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Parse + validate body ─────────────────────────────────────────────────
    const rawBody: unknown = await req.json()
    const parsedBody = parseRequestBody(rawBody)
    if (!parsedBody) {
      return new Response(JSON.stringify({ error: 'Missing content' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { content, contentType, startDate, raceDate, planName } = parsedBody

    if (!content) {
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

    const parseController = new AbortController()
    const parseTimeout = setTimeout(() => parseController.abort(), 30000)
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
      signal: parseController.signal,
    })
    clearTimeout(parseTimeout)

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

    let rawParsed: unknown
    try {
      rawParsed = JSON.parse(jsonStr)
    } catch {
      console.error('[parse-plan] JSON parse failed. Raw text:', rawText.slice(0, 500))
      return new Response(JSON.stringify({ error: 'parse_failed' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const parsed = validateParsedPlan(rawParsed)
    if (!parsed) {
      console.error('[parse-plan] Parsed JSON failed shape validation. Raw text:', rawText.slice(0, 500))
      return new Response(JSON.stringify({ error: 'parse_failed' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rawSessions = parsed.sessions

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
    console.error(`[parse-plan] request ${requestId} user ${userId ?? 'unauthenticated'} failed:`, message)

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
