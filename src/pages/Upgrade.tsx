import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { COLORS } from '../lib/colors'
import { useSubscription } from '../hooks/useSubscription'
import { useProfile } from '../contexts/ProfileContext'
import { supabase } from '../lib/supabase'

const FREE_FEATURES = [
  'Workout logging + library',
  'Training calendar (month + week view)',
  'Dashboard with CTL/ATL/TSB',
  'Strava sync',
  'First-time onboarding',
]

const PRO_FEATURES = [
  'Everything in Free',
  'Performance Analytics (power curve, pace, HR zones)',
  'AI Coach — weekly briefings + race predictor',
  'AI training plan generator',
  'Training plan import (PDF/text)',
  'Nutrition tracking + food database',
]

export function Upgrade() {
  const { isPro } = useSubscription()
  const { profile } = useProfile()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const success = searchParams.get('success') === 'true'

  // Redirect to dashboard after success once profile refreshes to pro
  useEffect(() => {
    if (success && isPro) {
      const t = setTimeout(() => navigate('/dashboard'), 3000)
      return () => clearTimeout(t)
    }
  }, [success, isPro, navigate])

  async function handleUpgrade() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ returnUrl: window.location.origin }),
        }
      )
      const { url, error } = await res.json()
      if (error) throw new Error(error)
      window.location.href = url
    } catch (err) {
      console.error('Checkout error:', err)
      setLoading(false)
    }
  }

  async function handleManageSubscription() {
    setPortalLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token || !profile?.stripe_customer_id) return

      // Customer portal wired once stripe-webhook is deployed and customer ID is confirmed
      console.warn('Customer portal not yet wired')
    } finally {
      setPortalLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 0' }}>
      {success && (
        <div style={{
          background: `${COLORS.green}15`,
          border: `1px solid ${COLORS.green}40`,
          borderRadius: 12,
          padding: '16px 24px',
          marginBottom: 32,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>✓</span>
          <div>
            <div style={{ fontWeight: 700, color: COLORS.green }}>You're now on Pro!</div>
            <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>
              All features are unlocked. Redirecting you to the dashboard…
            </div>
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', color: COLORS.text }}>
          Choose your plan
        </div>
        <div style={{ fontSize: 15, color: COLORS.muted, marginTop: 8 }}>
          Built for serious endurance athletes. Cancel anytime.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Free card */}
        <div style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          padding: '28px 28px 32px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: COLORS.muted, marginBottom: 8 }}>
            FREE
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: COLORS.text }}>
            $0
            <span style={{ fontSize: 14, fontWeight: 400, color: COLORS.muted }}> /mo</span>
          </div>
          <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4, marginBottom: 24 }}>
            Get started, no credit card required
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FREE_FEATURES.map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: COLORS.text }}>
                <span style={{ color: COLORS.muted, flexShrink: 0, marginTop: 1 }}>○</span>
                {f}
              </div>
            ))}
          </div>

          {!isPro && (
            <div style={{
              marginTop: 28,
              padding: '11px',
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 600,
              color: COLORS.muted,
            }}>
              Current plan
            </div>
          )}
        </div>

        {/* Pro card */}
        <div style={{
          background: COLORS.surface,
          border: `2px solid ${COLORS.accent}`,
          borderRadius: 16,
          padding: '28px 28px 32px',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            top: -12,
            left: 24,
            background: COLORS.accent,
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            padding: '3px 12px',
            borderRadius: 20,
          }}>
            RECOMMENDED
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: COLORS.accent, marginBottom: 8 }}>
            PRO
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: COLORS.text }}>
            $9
            <span style={{ fontSize: 14, fontWeight: 400, color: COLORS.muted }}> /mo</span>
          </div>
          <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4, marginBottom: 24 }}>
            Full access to every feature
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PRO_FEATURES.map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: COLORS.text }}>
                <span style={{ color: COLORS.accent, flexShrink: 0, marginTop: 1 }}>✓</span>
                {f}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 28 }}>
            {isPro ? (
              <button
                onClick={handleManageSubscription}
                disabled={portalLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'none',
                  border: `1px solid ${COLORS.accent}`,
                  borderRadius: 10,
                  color: COLORS.accent,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {portalLoading ? 'Loading…' : 'Manage subscription'}
              </button>
            ) : (
              <button
                onClick={handleUpgrade}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: loading ? COLORS.muted : COLORS.accent,
                  border: 'none',
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#0284c7' }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.background = COLORS.accent }}
              >
                {loading ? 'Redirecting…' : 'Get Pro — $9/mo'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: COLORS.muted }}>
        Secure payment via Stripe · Cancel anytime · No hidden fees
      </div>
    </div>
  )
}
