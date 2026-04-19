import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { COLORS } from '../lib/colors'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'

export function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      await signUp(email, password, name)
      setSuccess(true)
      setTimeout(() => navigate('/onboarding'), 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Signup failed')
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

  if (success) {
    return (
      <div style={{
        minHeight: '100vh', background: COLORS.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, marginBottom: 8 }}>Account created!</div>
          <div style={{ fontSize: 13, color: COLORS.muted }}>Redirecting to your dashboard…</div>
        </div>
      </div>
    )
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
          <div style={{ fontSize: 11, color: COLORS.muted, letterSpacing: '0.14em', marginTop: 4 }}>TRAINING SYSTEM</div>
        </div>

        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 32 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text, marginBottom: 6 }}>Create account</div>
          <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 28 }}>Start tracking your training today</div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>
                Your Name
              </label>
              <input
                style={inputStyle}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jake Davis"
                required
                autoComplete="name"
              />
            </div>
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
                placeholder="Min. 6 characters"
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
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: COLORS.muted }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: COLORS.accent, fontWeight: 600, textDecoration: 'none' }}>
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
