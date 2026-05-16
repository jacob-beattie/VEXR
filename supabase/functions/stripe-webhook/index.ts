import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Stripe webhook signature verification using Web Crypto API
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = sigHeader.split(',').reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split('=')
    acc[k] = v
    return acc
  }, {})

  const timestamp = parts['t']
  const signature = parts['v1']
  if (!timestamp || !signature) return false

  const signedPayload = `${timestamp}.${payload}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))
  const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('')
  return expected === signature
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!stripeKey || !webhookSecret) return new Response('Stripe not configured', { status: 500 })

  const payload = await req.text()
  const sigHeader = req.headers.get('stripe-signature') ?? ''

  const valid = await verifyStripeSignature(payload, sigHeader, webhookSecret)
  if (!valid) return new Response('Invalid signature', { status: 400 })

  const event = JSON.parse(payload)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  async function setTier(customerId: string, tier: 'free' | 'pro', subscriptionId?: string) {
    const update: Record<string, string | null> = { subscription_tier: tier }
    if (subscriptionId !== undefined) update['stripe_subscription_id'] = subscriptionId ?? null
    await supabase.from('profiles').update(update).eq('stripe_customer_id', customerId)
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode === 'subscription' && session.subscription) {
        await setTier(session.customer, 'pro', session.subscription)
      }
      break
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object
      const active = sub.status === 'active' || sub.status === 'trialing'
      await setTier(sub.customer, active ? 'pro' : 'free', sub.id)
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object
      await setTier(sub.customer, 'free', null)
      break
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
