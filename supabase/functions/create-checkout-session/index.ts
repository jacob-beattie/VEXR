import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS: string[] = Deno.env.get('ALLOWED_ORIGIN')
  ? [...Deno.env.get('ALLOWED_ORIGIN')!.split(',').map(s => s.trim()), 'http://localhost:5173', 'http://localhost:3000']
  : []

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowed = ALLOWED_ORIGINS.length === 0 ? '*' : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0])
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (userErr || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeKey) return new Response('Stripe not configured', { status: 500, headers: corsHeaders })

  const { returnUrl } = await req.json()
  const origin = returnUrl || Deno.env.get('ALLOWED_ORIGIN')?.split(',')[0] || 'http://localhost:5173'
  const successUrl = `${origin}/upgrade?success=true`
  const cancelUrl = `${origin}/upgrade`

  // Fetch or create Stripe customer
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, name')
    .eq('id', user.id)
    .single()

  let customerId: string = profile?.stripe_customer_id ?? ''

  if (!customerId) {
    const custRes = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        email: user.email ?? '',
        name: profile?.name ?? '',
        'metadata[user_id]': user.id,
      }),
    })
    const cust = await custRes.json()
    customerId = cust.id

    await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
  }

  // Create Checkout Session
  const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      customer: customerId,
      'line_items[0][price]': Deno.env.get('STRIPE_PRO_PRICE_ID') ?? '',
      'line_items[0][quantity]': '1',
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      'metadata[user_id]': user.id,
    }),
  })

  const session = await sessionRes.json()
  if (!session.url) {
    return new Response(JSON.stringify({ error: session.error?.message ?? 'Failed to create session' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
