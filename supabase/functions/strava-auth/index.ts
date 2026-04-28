import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
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

    console.log('[strava-auth] STRAVA_CLIENT_ID:', clientId ?? 'NOT SET')
    console.log('[strava-auth] STRAVA_CLIENT_SECRET:', clientSecret ? `set (${clientSecret.length} chars)` : 'NOT SET')

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
    console.log('[strava-auth] Strava response body:', JSON.stringify(tokens))

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
