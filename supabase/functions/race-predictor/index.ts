import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseAllowedOrigins, getCorsHeaders as corsHeadersFor } from '../_shared/cors.ts'
import { checkRateLimit, releaseRateLimit } from '../_shared/rateLimit.ts'
import { callClaude } from '../_shared/anthropic.ts'
import type { Database } from '../_shared/database.types.ts'

// ── Contract ─────────────────────────────────────────────────────────────────
// POST, Authorization: Bearer <supabase JWT>
// Body: RacePredictorBody —
//   { ctl: number, ftp?: number, runPace?: string, css?: string,
//     sport: 'triathlon'|'cycling'|'running'|'swimming',
//     predictions: { running: string, cycling: string, swimming: string, triathlon: string } }
//   - predictions are the client-computed finish-time strings from racePredictorMath.ts; this
//     function only asks Claude to narrate them, it doesn't compute times itself
// Success 200: { narrative: string }  — not persisted server-side; caller (RacePredictor.tsx)
//   caches it in localStorage
// Errors:
//   401 { error: 'Unauthorized' }                    — missing/invalid bearer token
//   429 { error: 'Rate limit exceeded...' }           — >10 narratives/hr (bucket name kept as
//                                                         'ai-briefing-predictor' — see below)
//   400 { error: 'Missing or invalid required fields' } — body failed field-by-field validation
//   504 { error: 'The AI coach took too long...', requestId } — Claude call exceeded 30s
//   500 { error: 'An internal error occurred...', requestId } — any other failure

const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGIN'))

function getCorsHeaders(req: Request): Record<string, string> {
  return corsHeadersFor(req.headers.get('Origin') ?? '', ALLOWED_ORIGINS)
}

const PREDICTOR_RATE_LIMIT = 10

const PROFILE_SPORTS = ['triathlon', 'cycling', 'running', 'swimming'] as const

interface RacePredictorBody {
  ctl: number
  ftp?: number
  runPace?: string
  css?: string
  sport: string
  predictions: { running: string; cycling: string; swimming: string; triathlon: string }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Narrows the request body field-by-field instead of a blind `as` cast — these values are
// interpolated directly into the Claude prompt below, so a wrong-typed or oversized field
// must fail here rather than flow into prompt construction unchecked.
function parseRaceBody(body: unknown): RacePredictorBody | null {
  if (!isRecord(body)) return null
  if (typeof body.ctl !== 'number' || !Number.isFinite(body.ctl) || body.ctl < 0 || body.ctl > 500) return null
  if (typeof body.sport !== 'string' || !(PROFILE_SPORTS as readonly string[]).includes(body.sport)) return null
  if (body.ftp !== undefined && (typeof body.ftp !== 'number' || !Number.isFinite(body.ftp) || body.ftp < 0 || body.ftp > 2000)) return null
  if (body.runPace !== undefined && (typeof body.runPace !== 'string' || body.runPace.length > 20)) return null
  if (body.css !== undefined && (typeof body.css !== 'string' || body.css.length > 20)) return null

  if (!isRecord(body.predictions)) return null
  const p = body.predictions
  const predictionFields = ['running', 'cycling', 'swimming', 'triathlon'] as const
  for (const field of predictionFields) {
    if (typeof p[field] !== 'string' || (p[field] as string).length > 300) return null
  }

  return {
    ctl: body.ctl,
    sport: body.sport,
    ftp: typeof body.ftp === 'number' ? body.ftp : undefined,
    runPace: typeof body.runPace === 'string' ? body.runPace : undefined,
    css: typeof body.css === 'string' ? body.css : undefined,
    predictions: {
      running: p.running as string,
      cycling: p.cycling as string,
      swimming: p.swimming as string,
      triathlon: p.triathlon as string,
    },
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

    let raceBody: Record<string, unknown> = {}
    try {
      raceBody = (await req.json()) ?? {}
    } catch { /* no body or non-JSON — fine */ }

    // Rate-limit bucket name kept as 'ai-briefing-predictor' (not renamed to match this
    // function) so existing api_rate_limits rows/quotas for this feature carry over —
    // this was split out of ai-briefing's `mode: 'race_predictor'` branch, not a new feature.
    const allowed = await checkRateLimit(user.id, 'ai-briefing-predictor', PREDICTOR_RATE_LIMIT)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please wait before refreshing predictions.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const parsedRaceBody = parseRaceBody(raceBody)
    if (!parsedRaceBody) {
      return new Response(JSON.stringify({ error: 'Missing or invalid required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { ctl, ftp, runPace, css, sport, predictions } = parsedRaceBody

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

    // Wrapped separately from the outer handler try/catch: if the Claude call itself
    // fails to produce a usable narrative, refund the rate-limit slot checkRateLimit
    // just reserved before rethrowing to the outer catch for the actual error response.
    try {
      const narrative = await callClaude(racePrompt, 300, 'race-predictor')
      if (!narrative) throw new Error('Empty response from AI service')

      return new Response(
        JSON.stringify({ narrative }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    } catch (claudeErr) {
      await releaseRateLimit(user.id, 'ai-briefing-predictor')
      throw claudeErr
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[race-predictor] request ${requestId} user ${userId ?? 'unauthenticated'} failed:`, message)

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
