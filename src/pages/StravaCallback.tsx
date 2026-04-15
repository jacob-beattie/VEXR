import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { COLORS } from '../lib/colors'
import { supabase } from '../lib/supabase'
import { useStrava } from '../contexts/StravaContext'

export function StravaCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { refetchConnection } = useStrava()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    if (error || !code) {
      setErrorMessage(error === 'access_denied'
        ? 'You declined the Strava connection.'
        : 'No authorisation code received from Strava.')
      setStatus('error')
      return
    }

    exchangeCode(code)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function exchangeCode(code: string) {
    try {
      console.log('[StravaCallback] exchanging code:', code.slice(0, 6) + '…')

      // Get the user's JWT so the edge function can identify them
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not logged in')

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

      const res = await fetch(`${supabaseUrl}/functions/v1/strava-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({ code }),
      })

      const body = await res.json()
      console.log('[StravaCallback] response status:', res.status, 'body:', JSON.stringify(body))

      if (!res.ok) throw new Error(body.error || body.message || `HTTP ${res.status}`)

      await refetchConnection()
      setStatus('success')

      setTimeout(() => navigate('/dashboard'), 2000)
    } catch (err: unknown) {
      console.error('[StravaCallback] error:', err)
      setErrorMessage(err instanceof Error ? err.message : 'Connection failed')
      setStatus('error')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: COLORS.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
    }}>
      <div style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: '40px 48px',
        textAlign: 'center',
        maxWidth: 400,
        width: '100%',
      }}>
        {status === 'loading' && (
          <>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⟳</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text, marginBottom: 8 }}>
              Connecting Strava…
            </div>
            <div style={{ fontSize: 13, color: COLORS.muted }}>
              Exchanging authorisation code
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: 32, marginBottom: 16 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.green, marginBottom: 8 }}>
              Strava connected!
            </div>
            <div style={{ fontSize: 13, color: COLORS.muted }}>
              Redirecting to your dashboard…
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 32, marginBottom: 16 }}>✕</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.orange, marginBottom: 8 }}>
              Connection failed
            </div>
            <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 24, lineHeight: 1.5 }}>
              {errorMessage}
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                background: COLORS.accent + '20',
                border: `1px solid ${COLORS.accent}`,
                borderRadius: 8,
                color: COLORS.accent,
                fontSize: 13, fontWeight: 600,
                padding: '10px 20px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Back to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  )
}
