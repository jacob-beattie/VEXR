import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseAllowedOrigins, getCorsHeaders as corsHeadersFor } from '../_shared/cors.ts'

const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGIN'))

const RATE_WINDOW_MS = 60 * 60 * 1000
const STRAVA_AUTH_RATE_LIMIT = 5

type SupabaseClient = ReturnType<typeof createClient>

async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  functionName: string,
  limit: number,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count } = await supabase
    .from('api_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('function_name', functionName)
    .gte('called_at', windowStart)
  if ((count ?? 0) >= limit) return false
  await supabase.from('api_rate_limits').insert({ user_id: userId, function_name: functionName })
  return true
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req.headers.get('Origin') ?? '', ALLOWED_ORIGINS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── 1. Parse request body ──────────────────────────────────────────────
    const body = await req.json()
    const { code } = body
    console.log('[strava-auth] received code:', code ? `${String(code).slice(0, 6)}…` : 'MISSING')
    if (!code) throw new Error('Missing authorization code')

    // ── 2. Read secrets ────────────────────────────────────────────────────
    const clientId = Deno.env.get('STRAVA_CLIENT_ID')
    const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET')

    console.log('[strava-auth] STRAVA_CLIENT_ID set:', !!clientId)
    console.log('[strava-auth] STRAVA_CLIENT_SECRET set:', !!clientSecret)

    if (!clientId) throw new Error('STRAVA_CLIENT_ID secret is not set on this edge function')
    if (!clientSecret) throw new Error('STRAVA_CLIENT_SECRET secret is not set on this edge function')

    // ── 3. Token exchange with Strava ──────────────────────────────────────
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

    // ── 4. Authenticate the Vexr user via their JWT ────────────────────────
    const authHeader = req.headers.get('Authorization')
    console.log('[strava-auth] Authorization header present:', !!authHeader)

    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
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

    const allowed = await checkRateLimit(supabase, user.id, 'strava-auth', STRAVA_AUTH_RATE_LIMIT)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 5. Upsert connection ───────────────────────────────────────────────
    const athleteName = [tokens.athlete?.firstname, tokens.athlete?.lastname]
      .filter(Boolean).join(' ') || null

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
    console.error('[strava-auth] error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
