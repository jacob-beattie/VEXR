import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { COLORS } from '../lib/colors'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError('')
    setResetLoading(true)
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (resetErr) throw resetErr
      setResetSent(true)
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : 'Failed to send reset email.')
    } finally {
      setResetLoading(false)
    }
  }

  const inputStyle = {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    padding: '12px 16px',
    color: COLORS.text,
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box' as const,
    outline: 'none',
    fontFamily: 'inherit',
  }

  return (
    <div style={{
      minHeight: '100vh', background: COLORS.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '0.08em', color: COLORS.text }}>
            <span style={{ color: COLORS.accent }}>VEX</span>R
          </div>
          <div style={{ fontSize: 13, color: COLORS.muted, letterSpacing: '0.06em', marginTop: 8 }}>Train. Track. Perform.</div>
        </div>

        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 32 }}>
          {showReset ? (
            <>
              <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text, marginBottom: 6 }}>Reset password</div>
              <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 28 }}>Enter your email and we'll send a reset link.</div>
              {resetSent ? (
                <div style={{ color: COLORS.accent, fontSize: 14, textAlign: 'center', padding: '12px 0' }}>
                  Check your inbox for a reset link.
                </div>
              ) : (
                <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <input
                    type="email"
                    style={inputStyle}
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                  {resetError && (
                    <div style={{ color: COLORS.orange, fontSize: 13, padding: '10px 14px', background: COLORS.orange + '15', borderRadius: 8 }}>
                      {resetError}
                    </div>
                  )}
                  <Button type="submit" disabled={resetLoading} style={{ padding: '13px 18px', fontSize: 14 }}>
                    {resetLoading ? 'Sending…' : 'Send Reset Link'}
                  </Button>
                </form>
              )}
              <div style={{ marginTop: 20, textAlign: 'center' }}>
                <button onClick={() => setShowReset(false)} style={{ background: 'none', border: 'none', color: COLORS.accent, fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', padding: 0 }}>
                  Back to sign in
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text, marginBottom: 6 }}>Welcome back</div>
              <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 28 }}>Sign in to your training dashboard</div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>
                    Email
                  </label>
                  <input
                    type="email"
                    style={inputStyle}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>
                    Password
                  </label>
                  <input
                    type="password"
                    style={inputStyle}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                </div>

                {error && (
                  <div style={{ color: COLORS.orange, fontSize: 13, padding: '10px 14px', background: COLORS.orange + '15', borderRadius: 8 }}>
                    {error}
                  </div>
                )}

                <Button type="submit" disabled={loading} style={{ marginTop: 4, padding: '13px 18px', fontSize: 14 }}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>

              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <button onClick={() => setShowReset(true)} style={{ background: 'none', border: 'none', color: COLORS.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                  Forgot password?
                </button>
              </div>

              <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: COLORS.muted }}>
                Don't have an account?{' '}
                <Link to="/signup" style={{ color: COLORS.accent, fontWeight: 600, textDecoration: 'none' }}>
                  Sign up
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
