import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { COLORS } from '../lib/colors'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'

const SPORTS = ['triathlon', 'cycling', 'running', 'swimming'] as const
const SPORT_LABELS: Record<string, string> = {
  triathlon: 'Triathlon',
  cycling: 'Cycling',
  running: 'Running',
  swimming: 'Swimming',
}
const TOTAL_STEPS = 3

const TOOLTIPS: Record<string, string> = {
  ftp: 'Functional Threshold Power — the maximum power (watts) you can sustain for ~60 minutes. Used to calculate cycling TSS and training zones.',
  runPace: 'Your threshold pace — the pace (min/km) you can sustain for ~60 minutes. Used to calculate running TSS and zones.',
  css: 'Critical Swim Speed — your estimated 400m time minus your 200m time, expressed per 100m. Used to calculate swim TSS and zones.',
}

function Tooltip({ id, active, onShow, onHide }: {
  id: string
  active: boolean
  onShow: (id: string) => void
  onHide: () => void
}) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        onMouseEnter={() => onShow(id)}
        onMouseLeave={onHide}
        onFocus={() => onShow(id)}
        onBlur={onHide}
        style={{
          width: 16, height: 16, borderRadius: '50%',
          background: COLORS.subtle,
          border: `1px solid ${COLORS.border}`,
          color: COLORS.muted,
          fontSize: 10, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'default', fontFamily: 'inherit',
          lineHeight: 1, padding: 0, flexShrink: 0,
        }}
      >
        ?
      </button>
      {active && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 8px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: '10px 12px',
          fontSize: 12,
          color: COLORS.text,
          lineHeight: 1.5,
          width: 240,
          zIndex: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}>
          {TOOLTIPS[id]}
        </div>
      )}
    </span>
  )
}

const inputStyle = (isMobile: boolean) => ({
  background: COLORS.surface,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  padding: '12px 14px',
  color: COLORS.text,
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box' as const,
  outline: 'none',
  fontFamily: 'inherit',
  display: 'block',
  ...(isMobile ? {} : {}),
})

const labelStyle = {
  fontSize: 11,
  color: COLORS.muted,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: 7,
}

export function Onboarding() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [userId, setUserId] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [step, setStep] = useState(1)
  const [visible, setVisible] = useState(true)

  // Step 1
  const [name, setName] = useState('')
  const [sport, setSport] = useState('')

  // Step 2
  const [ftp, setFtp] = useState('')
  const [runPace, setRunPace] = useState('')
  const [css, setCss] = useState('')
  const [raceGoal, setRaceGoal] = useState('')
  const [raceDate, setRaceDate] = useState('')

  const [activeTooltip, setActiveTooltip] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login', { replace: true })
        return
      }
      setUserId(session.user.id)

      supabase
        .from('profiles')
        .select('onboarding_completed, name, sport')
        .eq('id', session.user.id)
        .single()
        .then(({ data }) => {
          if (data?.onboarding_completed) {
            navigate('/dashboard', { replace: true })
            return
          }
          if (data?.name) setName(data.name)
          if (data?.sport) setSport(data.sport)
          setAuthLoading(false)
        })
    })
  }, [navigate])

  useEffect(() => {
    if (!authLoading && step === 1) {
      setTimeout(() => nameRef.current?.focus(), 300)
    }
  }, [authLoading, step])

  const transition = (newStep: number) => {
    setVisible(false)
    setError('')
    setTimeout(() => {
      setStep(newStep)
      setVisible(true)
    }, 200)
  }

  const handleStep1 = async () => {
    if (!name.trim()) { setError('Please enter your name'); return }
    if (!sport) { setError('Please select your sport'); return }
    if (!userId) return
    setSaving(true)
    setError('')
    try {
      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ name: name.trim(), sport })
        .eq('id', userId)
      if (dbErr) throw dbErr
      transition(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleStep2 = async () => {
    if (!userId) return
    setSaving(true)
    setError('')
    try {
      const updates: Record<string, unknown> = {}
      if (ftp) updates.ftp = parseInt(ftp, 10)
      if (runPace) updates.run_pace = runPace
      if (css) updates.css = css
      if (raceGoal) updates.race_goal = raceGoal
      if (raceDate) updates.race_date = raceDate
      if (Object.keys(updates).length > 0) {
        const { error: dbErr } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', userId)
        if (dbErr) throw dbErr
      }
      transition(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const completeOnboarding = async () => {
    if (!userId) return
    await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', userId)
    sessionStorage.setItem('onboardingWelcome', 'true')
    navigate('/dashboard', { replace: true })
  }

  const handleStravaConnect = async () => {
    if (!userId) return
    await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', userId)
    sessionStorage.setItem('fromOnboarding', 'true')
    const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID as string
    const redirectUri = import.meta.env.VITE_STRAVA_REDIRECT_URI as string
    window.location.href = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=activity:read_all`
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontSize: 14, fontFamily: "'Inter', 'Helvetica Neue', sans-serif" }}>
        Loading…
      </div>
    )
  }

  const showCss = sport === 'triathlon' || sport === 'swimming'
  const cardWidth = isMobile ? '100%' : 480

  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.bg,
      color: COLORS.text,
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      {/* Progress bar */}
      <div style={{
        width: '100%',
        height: 3,
        background: COLORS.subtle,
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 10,
      }}>
        <div style={{
          height: '100%',
          width: `${(step / TOTAL_STEPS) * 100}%`,
          background: COLORS.accent,
          transition: 'width 0.4s ease',
          borderRadius: '0 2px 2px 0',
        }} />
      </div>

      {/* Step indicator */}
      <div style={{
        width: '100%',
        maxWidth: cardWidth,
        padding: isMobile ? '28px 20px 0' : '48px 0 0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              width: s === step ? 20 : 6,
              height: 6,
              borderRadius: 3,
              background: s < step ? COLORS.accent : s === step ? COLORS.accent : COLORS.subtle,
              transition: 'all 0.3s ease',
              opacity: s > step ? 0.4 : 1,
            }} />
          ))}
        </div>
        <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600 }}>
          Step {step} of {TOTAL_STEPS}
        </div>
      </div>

      {/* Step content */}
      <div style={{
        width: '100%',
        maxWidth: cardWidth,
        padding: isMobile ? '32px 20px 40px' : '48px 0 60px',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s ease',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* ─── STEP 1: Welcome ─────────────────────────────────── */}
        {step === 1 && (
          <div>
            {/* Logo */}
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <div style={{ fontSize: isMobile ? 36 : 44, fontWeight: 900, letterSpacing: '0.08em', color: COLORS.text }}>
                <span style={{ color: COLORS.accent }}>VEX</span>R
              </div>
              <div style={{ fontSize: 11, color: COLORS.muted, letterSpacing: '0.14em', marginTop: 4 }}>TRAINING SYSTEM</div>
            </div>

            <h1 style={{ fontSize: isMobile ? 26 : 32, fontWeight: 800, color: COLORS.text, margin: '0 0 10px', lineHeight: 1.2 }}>
              Welcome to Vexr
            </h1>
            <p style={{ fontSize: 15, color: COLORS.muted, margin: '0 0 40px', lineHeight: 1.6 }}>
              Let's get you set up in 3 quick steps
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <label style={labelStyle}>First Name</label>
                <input
                  ref={nameRef}
                  style={inputStyle(isMobile)}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  onKeyDown={e => { if (e.key === 'Enter') handleStep1() }}
                  autoComplete="given-name"
                />
              </div>

              <div>
                <label style={labelStyle}>Your Sport</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {SPORTS.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSport(s)}
                      style={{
                        padding: '10px 20px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.15s',
                        background: sport === s ? COLORS.accent : COLORS.surface,
                        color: sport === s ? '#000' : COLORS.text,
                        borderTop: `1px solid ${sport === s ? COLORS.accent : COLORS.border}`,
                        borderRight: `1px solid ${sport === s ? COLORS.accent : COLORS.border}`,
                        borderBottom: `1px solid ${sport === s ? COLORS.accent : COLORS.border}`,
                        borderLeft: `1px solid ${sport === s ? COLORS.accent : COLORS.border}`,
                      }}
                    >
                      {SPORT_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div style={{ marginTop: 20, color: COLORS.orange, fontSize: 13, padding: '10px 14px', background: COLORS.orange + '15', borderRadius: 8 }}>
                {error}
              </div>
            )}

            <button
              onClick={handleStep1}
              disabled={saving}
              style={{
                marginTop: 36,
                width: '100%',
                padding: '14px 24px',
                borderRadius: 10,
                background: COLORS.accent,
                border: 'none',
                color: '#000',
                fontSize: 15,
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: saving ? 0.7 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {saving ? 'Saving…' : 'Get Started →'}
            </button>
          </div>
        )}

        {/* ─── STEP 2: Benchmarks ──────────────────────────────── */}
        {step === 2 && (
          <div>
            <h1 style={{ fontSize: isMobile ? 26 : 32, fontWeight: 800, color: COLORS.text, margin: '0 0 10px', lineHeight: 1.2 }}>
              Set your benchmarks
            </h1>
            <p style={{ fontSize: 15, color: COLORS.muted, margin: '0 0 36px', lineHeight: 1.6 }}>
              These help us calculate your training zones and TSS accurately
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={labelStyle}>
                  FTP (watts)
                  <Tooltip id="ftp" active={activeTooltip === 'ftp'} onShow={setActiveTooltip} onHide={() => setActiveTooltip(null)} />
                </label>
                <input
                  type="number"
                  className="no-spinner"
                  style={inputStyle(isMobile)}
                  value={ftp}
                  onChange={e => setFtp(e.target.value)}
                  placeholder="e.g. 280"
                  min={50}
                  max={600}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Run Threshold Pace (min/km)
                  <Tooltip id="runPace" active={activeTooltip === 'runPace'} onShow={setActiveTooltip} onHide={() => setActiveTooltip(null)} />
                </label>
                <input
                  style={inputStyle(isMobile)}
                  value={runPace}
                  onChange={e => setRunPace(e.target.value)}
                  placeholder="e.g. 4:30"
                />
              </div>

              {showCss && (
                <div>
                  <label style={labelStyle}>
                    CSS (min/100m)
                    <Tooltip id="css" active={activeTooltip === 'css'} onShow={setActiveTooltip} onHide={() => setActiveTooltip(null)} />
                  </label>
                  <input
                    style={inputStyle(isMobile)}
                    value={css}
                    onChange={e => setCss(e.target.value)}
                    placeholder="e.g. 1:45"
                  />
                </div>
              )}

              <div>
                <label style={labelStyle}>Race Goal</label>
                <input
                  style={inputStyle(isMobile)}
                  value={raceGoal}
                  onChange={e => setRaceGoal(e.target.value)}
                  placeholder="e.g. Ironman 70.3 Melbourne"
                />
              </div>

              <div>
                <label style={labelStyle}>Race Date</label>
                <input
                  type="date"
                  style={{
                    ...inputStyle(isMobile),
                    colorScheme: 'dark',
                  }}
                  value={raceDate}
                  onChange={e => setRaceDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>

            {error && (
              <div style={{ marginTop: 20, color: COLORS.orange, fontSize: 13, padding: '10px 14px', background: COLORS.orange + '15', borderRadius: 8 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 32 }}>
              <button
                onClick={handleStep2}
                disabled={saving}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  borderRadius: 10,
                  background: COLORS.accent,
                  border: 'none',
                  color: '#000',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: saving ? 0.7 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {saving ? 'Saving…' : "Save & Continue →"}
              </button>
              <button
                onClick={() => transition(3)}
                type="button"
                style={{
                  width: '100%',
                  padding: '12px 24px',
                  borderRadius: 10,
                  background: 'none',
                  border: 'none',
                  color: COLORS.muted,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                I'll set these later
              </button>
            </div>

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-start' }}>
              <button
                onClick={() => transition(1)}
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: COLORS.muted,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Connect Strava ───────────────────────────── */}
        {step === 3 && (
          <div>
            <h1 style={{ fontSize: isMobile ? 26 : 32, fontWeight: 800, color: COLORS.text, margin: '0 0 10px', lineHeight: 1.2 }}>
              Import your training
            </h1>
            <p style={{ fontSize: 15, color: COLORS.muted, margin: '0 0 40px', lineHeight: 1.6 }}>
              Connect Strava to automatically import your workouts — no manual logging needed
            </p>

            {/* Strava connect button */}
            <button
              onClick={handleStravaConnect}
              style={{
                width: '100%',
                padding: '16px 24px',
                borderRadius: 10,
                background: '#FC4C02',
                border: 'none',
                color: '#fff',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                marginBottom: 28,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              Connect with Strava
            </button>

            {/* Benefits */}
            <div style={{
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              marginBottom: 32,
            }}>
              {[
                'Auto-import all past and future workouts',
                'HR, power, pace and distance synced automatically',
                'Never log a workout manually again',
              ].map(benefit => (
                <div key={benefit} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ color: COLORS.green, fontSize: 14, marginTop: 1, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.5 }}>{benefit}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={completeOnboarding}
                style={{
                  width: '100%',
                  padding: '12px 24px',
                  borderRadius: 10,
                  background: 'none',
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.muted,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                I'll connect later
              </button>
            </div>

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-start' }}>
              <button
                onClick={() => transition(2)}
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: COLORS.muted,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                ← Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
