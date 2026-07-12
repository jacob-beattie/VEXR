import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseAllowedOrigins, getCorsHeaders as corsHeadersFor } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'
import { extractAuthCode, buildAthleteName } from '../_shared/stravaAuth.ts'
import { captureError } from '../_shared/errorTracking.ts'
import type { Database } from '../_shared/database.types.ts'

// ── Contract ─────────────────────────────────────────────────────────────────
// POST, Authorization: Bearer <supabase JWT>
// Body: { code: string }  — the OAuth authorization code Strava redirected back with
// Success 200: { success: true, athleteName: string | null }
//   - Exchanges the code for tokens via Strava's OAuth endpoint, then upserts the connection
//     into strava_connections (onConflict: user_id) — reconnecting overwrites the old tokens.
// Errors:
//   401 { error: 'Unauthorized' }                              — missing/invalid bearer token
//   429 { error: 'Rate limit exceeded. Try again later.' }      — >5 connect attempts/hr
//   400 { error: 'Missing authorization code' }                 — no `code` in body
//   500 { error: 'Strava connection failed. Please try again.', requestId } — token exchange or
//     DB failure (generic message client-side; real cause only in server logs)
// Requires STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET Supabase secrets.

const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGIN'))

const RATE_WINDOW_MS = 60 * 60 * 1000
const STRAVA_AUTH_RATE_LIMIT = 5

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req.headers.get('Origin') ?? '', ALLOWED_ORIGINS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const requestId = crypto.randomUUID()
  let userId: string | null = null

  try {
    // ── 1. Authenticate the Vexr user via their JWT ────────────────────────
    const authHeader = req.headers.get('Authorization')
    console.log('[strava-auth] Authorization header present:', !!authHeader)

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
    console.log('[strava-auth] Vexr user:', user?.id ?? 'NOT FOUND', authError?.message ?? '')
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    userId = user.id

    const allowed = await checkRateLimit(user.id, 'strava-auth', STRAVA_AUTH_RATE_LIMIT, RATE_WINDOW_MS)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 2. Parse request body ──────────────────────────────────────────────
    const body: unknown = await req.json()
    const code = extractAuthCode(body)
    console.log('[strava-auth] received code:', code ? `${code.slice(0, 6)}…` : 'MISSING')
    if (!code) {
      return new Response(JSON.stringify({ error: 'Missing authorization code' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 3. Read secrets ────────────────────────────────────────────────────
    const clientId = Deno.env.get('STRAVA_CLIENT_ID')
    const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET')

    console.log('[strava-auth] STRAVA_CLIENT_ID set:', !!clientId)
    console.log('[strava-auth] STRAVA_CLIENT_SECRET set:', !!clientSecret)

    if (!clientId) throw new Error('STRAVA_CLIENT_ID secret is not set on this edge function')
    if (!clientSecret) throw new Error('STRAVA_CLIENT_SECRET secret is not set on this edge function')

    // ── 4. Token exchange with Strava ──────────────────────────────────────
    // client_id must be sent as a number (integer), not a string
    const tokenPayload = {
      client_id: parseInt(clientId, 10),
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }
    console.log('[strava-auth] sending token exchange — client_id:', tokenPayload.client_id, 'grant_type:', tokenPayload.grant_type)

    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokenPayload),
    })

    const tokens = await tokenRes.json()
    console.log('[strava-auth] Strava response status:', tokenRes.status)

    if (!tokenRes.ok) {
      throw new Error(
        `Strava token exchange failed (${tokenRes.status}): ${tokens.message ?? tokens.error ?? JSON.stringify(tokens)}`
      )
    }

    // ── 5. Upsert connection ───────────────────────────────────────────────
    const athleteName = buildAthleteName(tokens.athlete)

    console.log('[strava-auth] upserting connection for athlete:', tokens.athlete?.id, athleteName)

    const { error: upsertError } = await supabase
      .from('strava_connections')
      .upsert(
        {
          user_id: user.id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_at,
          athlete_id: tokens.athlete.id,
          athlete_name: athleteName,
        },
        { onConflict: 'user_id' },
      )

    if (upsertError) {
      console.log('[strava-auth] upsert error:', upsertError.message)
      throw upsertError
    }

    console.log('[strava-auth] success — athlete:', athleteName)
    return new Response(
      JSON.stringify({ success: true, athleteName }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[strava-auth] request ${requestId} user ${userId ?? 'unauthenticated'} failed:`, message)
    captureError(err, { requestId, userId, function: 'strava-auth' })
    return new Response(
      JSON.stringify({ error: 'Strava connection failed. Please try again.', requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
