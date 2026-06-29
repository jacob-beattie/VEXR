import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { COLORS } from '../lib/colors'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'

export function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [validSession, setValidSession] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase injects the recovery token into the URL hash; it auto-exchanges it for a session.
    // We just need to confirm a session exists before letting the user set a new password.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setValidSession(true)
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setDone(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password.')
    } finally {
      setLoading(false)
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
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '0.08em', color: COLORS.text }}>
            VE<span style={{ color: COLORS.accent }}>X</span>R
          </div>
          <div style={{ fontSize: 13, color: COLORS.muted, letterSpacing: '0.06em', marginTop: 8 }}>Train. Track. Perform.</div>
        </div>

        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 32 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text, marginBottom: 6 }}>Set new password</div>
          <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 28 }}>Choose a password with at least 6 characters.</div>

          {done ? (
            <div style={{ color: COLORS.accent, fontSize: 14, textAlign: 'center', padding: '12px 0' }}>
              Password updated! Redirecting to login…
            </div>
          ) : !validSession ? (
            <div style={{ color: COLORS.orange, fontSize: 13, padding: '10px 14px', background: COLORS.orange + '15', borderRadius: 8 }}>
              This reset link is invalid or has expired. Please request a new one.
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>
                  New Password
                </label>
                <input
                  type="password"
                  style={inputStyle}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  style={inputStyle}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <div style={{ color: COLORS.orange, fontSize: 13, padding: '10px 14px', background: COLORS.orange + '15', borderRadius: 8 }}>
                  {error}
                </div>
              )}

              <Button type="submit" disabled={loading} style={{ marginTop: 4, padding: '13px 18px', fontSize: 14 }}>
                {loading ? 'Updating…' : 'Update Password'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
