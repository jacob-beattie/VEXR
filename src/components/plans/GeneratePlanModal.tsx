import { useState, useEffect, useRef } from 'react'
import { COLORS } from '../../lib/colors'
import type { ParsedSession, SessionSport } from '../../types'
import { ImportReviewScreen } from './ImportReviewScreen'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useWorkouts } from '../../contexts/WorkoutsContext'
import { useProfile } from '../../contexts/ProfileContext'

type SportType = 'triathlon' | 'run' | 'bike' | 'swim'

const DAYS_OF_WEEK = [
  { short: 'Mon', full: 'Monday' },
  { short: 'Tue', full: 'Tuesday' },
  { short: 'Wed', full: 'Wednesday' },
  { short: 'Thu', full: 'Thursday' },
  { short: 'Fri', full: 'Friday' },
  { short: 'Sat', full: 'Saturday' },
  { short: 'Sun', full: 'Sunday' },
]

const RACE_DISTANCES: Record<SportType, string[]> = {
  triathlon: ['Sprint', 'Olympic', '70.3', 'Ironman'],
  run: ['5K', '10K', 'Half Marathon', 'Marathon'],
  bike: ['40K TT', 'Century', 'Sportive'],
  swim: ['400m', '1500m', 'Open Water 1.9K', 'Open Water 3.8K'],
}

const GENERATE_MESSAGES = [
  'Analysing your fitness...',
  'Building your training block...',
  'Scheduling sessions...',
  'Finalising your plan...',
]

const VALID_SPORTS: SessionSport[] = ['swim', 'bike', 'run', 'sc', 'brick', 'other', 'rest']

function toSessionSport(s: string): SessionSport {
  return VALID_SPORTS.includes(s as SessionSport) ? (s as SessionSport) : 'other'
}

function formatDisplayDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`
}

interface EdgeSession {
  week: number
  day_of_week: string
  sport: string
  title: string
  description: string
  duration_minutes: number | null
  target_metric: string
  scheduled_date: string | null
  has_conflict: boolean
}

function mapEdgeSessions(raw: EdgeSession[]): ParsedSession[] {
  return raw.map((s, i) => ({
    id: i + 1,
    week: s.week,
    sport: toSessionSport(s.sport),
    title: s.title,
    date: s.scheduled_date ? formatDisplayDate(s.scheduled_date) : `Wk ${s.week} ${s.day_of_week ?? ''}`,
    dur: s.duration_minutes != null ? `${s.duration_minutes} min` : '',
    metric: s.target_metric ?? '',
    description: s.description ?? '',
    conflict: s.has_conflict,
    scheduledDate: s.scheduled_date ?? null,
  }))
}

function nextMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const add = day === 1 ? 7 : (8 - day) % 7
  d.setDate(d.getDate() + add)
  return d.toISOString().split('T')[0]
}

function profileSportToType(profileSport: string | null | undefined): SportType {
  if (profileSport === 'cycling') return 'bike'
  if (profileSport === 'swimming') return 'swim'
  if (profileSport === 'running') return 'run'
  return 'triathlon'
}

interface Props {
  onClose: () => void
  onSuccess: (message: string) => void
}

const labelStyle = {
  display: 'block' as const,
  fontSize: 11, fontWeight: 700, color: COLORS.muted,
  letterSpacing: '0.08em', textTransform: 'uppercase' as const,
  marginBottom: 7, fontFamily: 'DM Mono, monospace',
}

const SPORT_TO_TYPE: Record<string, string> = {
  swim: 'swim', bike: 'ride', run: 'run',
  sc: 'strength', brick: 'ride', other: 'strength',
}

export function GeneratePlanModal({ onClose, onSuccess }: Props) {
  const isMobile = useIsMobile()
  const { calculateFitnessMetrics } = useWorkouts()
  const { profile } = useProfile()

  const fitness = calculateFitnessMetrics()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [sport, setSport] = useState<SportType>(() => profileSportToType(profile?.sport))
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate')
  const [raceDistance, setRaceDistance] = useState<string>(RACE_DISTANCES[profileSportToType(profile?.sport)][0])
  const [raceDate, setRaceDate] = useState('')
  const [startDate, setStartDate] = useState(nextMonday)
  const [preferredDays, setPreferredDays] = useState<string[]>(['Monday', 'Wednesday', 'Friday', 'Saturday'])
  const [goalTime, setGoalTime] = useState('')
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generateMessages, setGenerateMessages] = useState<string[]>([])
  const [parsedSessions, setParsedSessions] = useState<ParsedSession[]>([])
  const [parsedPlanName, setParsedPlanName] = useState('')
  const [parsedRaceName, setParsedRaceName] = useState<string | null>(null)
  const [sportFilter, setSportFilter] = useState('all')
  const [openWeeks, setOpenWeeks] = useState<Record<number, boolean>>({})
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const pendingGenerateRef = useRef<Promise<ParsedSession[]> | null>(null)

  useEffect(() => {
    setRaceDistance(RACE_DISTANCES[sport][0])
  }, [sport])

  useEffect(() => {
    const weeks = Array.from(new Set(parsedSessions.map(s => s.week)))
    setOpenWeeks(Object.fromEntries(weeks.map(w => [w, true])))
  }, [parsedSessions])

  useEffect(() => {
    if (step !== 2) return
    let cancelled = false
    setGenerateMessages([])

    let msgIdx = 0
    const msgTimers: ReturnType<typeof setTimeout>[] = []
    const showMsg = () => {
      if (cancelled) return
      if (msgIdx < GENERATE_MESSAGES.length) {
        const msg = GENERATE_MESSAGES[msgIdx]
        setGenerateMessages(prev => [...prev, msg])
        msgIdx++
        msgTimers.push(setTimeout(showMsg, 900))
      }
    }
    msgTimers.push(setTimeout(showMsg, 300))

    const animDone = new Promise<void>(resolve => setTimeout(resolve, 3200))
    const apiCall = pendingGenerateRef.current ?? Promise.reject('No generate call initiated')

    Promise.all([animDone, apiCall])
      .then(([, sessions]) => {
        if (!cancelled) {
          setParsedSessions((sessions as ParsedSession[]).filter(s => s.sport !== 'rest'))
          setStep(3)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = typeof err === 'string' ? err : 'Something went wrong. Check your connection and try again.'
          setGenerateError(msg)
          setStep(1)
        }
      })

    return () => {
      cancelled = true
      msgTimers.forEach(clearTimeout)
    }
  }, [step])

  const callGenerateApi = async (): Promise<ParsedSession[]> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw 'Something went wrong. Check your connection and try again.'

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

    let res: Response
    try {
      res = await fetch(`${supabaseUrl}/functions/v1/generate-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          sport,
          raceDistance,
          raceDate,
          startDate,
          preferredDays,
          level,
          goalTime: goalTime || undefined,
          athleteProfile: {
            ctl: Math.round(fitness.ctl),
            ftp: profile?.ftp ?? undefined,
            thresholdPace: profile?.run_pace ?? undefined,
            css: profile?.css ?? undefined,
            primarySport: profile?.sport ?? 'triathlon',
          },
        }),
      })
    } catch {
      throw 'Something went wrong. Check your connection and try again.'
    }

    const data = await res.json()

    if (!res.ok) {
      throw data.error === 'parse_failed'
        ? 'Plan generation failed. Please try again.'
        : 'Something went wrong. Check your connection and try again.'
    }

    if (data.plan_name) setParsedPlanName(data.plan_name)
    if (data.race_name) setParsedRaceName(data.race_name)

    const sessions: ParsedSession[] = mapEdgeSessions(data.sessions ?? [])
    if (sessions.length === 0) throw 'No sessions were generated. Please try again.'

    return sessions
  }

  const toggleDay = (full: string) => {
    setPreferredDays(prev =>
      prev.includes(full)
        ? prev.length === 1 ? prev : prev.filter(d => d !== full)
        : [...prev, full]
    )
  }

  const handleGenerate = () => {
    if (!raceDate) { setGenerateError('Please set a race date.'); return }
    if (new Date(raceDate) <= new Date(startDate)) {
      setGenerateError('Race date must be after the plan start date.')
      return
    }
    setGenerateError(null)
    pendingGenerateRef.current = callGenerateApi()
    setStep(2)
  }

  const toggleWeek = (w: number) => setOpenWeeks(prev => ({ ...prev, [w]: !prev[w] }))

  const handleImport = async () => {
    setImportError(null)
    setImporting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const maxWeek = parsedSessions.length > 0 ? Math.max(...parsedSessions.map(s => s.week)) : 1

      const { data: plan, error: planError } = await supabase
        .from('training_plans')
        .insert({
          user_id: user.id,
          name: parsedPlanName || `${raceDistance} ${sport} Plan`,
          sport,
          total_weeks: maxWeek,
          current_week: 0,
          status: 'upcoming',
          race_name: parsedRaceName || null,
          race_date: raceDate || null,
          start_date: startDate || null,
          source: 'generated',
        })
        .select()
        .single()

      if (planError) throw planError

      const { error: sessionsError } = await supabase.from('training_sessions').insert(
        parsedSessions.filter(s => s.sport !== 'rest').map(s => ({
          user_id: user.id,
          plan_id: plan.id,
          week_number: s.week,
          sport: s.sport,
          title: s.title,
          scheduled_date: s.scheduledDate ?? null,
          duration_min: parseInt(s.dur) || null,
          target_metric: s.metric || null,
          notes: s.description || null,
          has_conflict: s.conflict,
          status: 'pending',
        }))
      )

      if (sessionsError) throw sessionsError

      const calendarRows = parsedSessions
        .filter(s => s.scheduledDate && s.sport !== 'rest')
        .map(s => ({
          user_id: user.id,
          plan_id: plan.id,
          title: s.title,
          type: SPORT_TO_TYPE[s.sport] ?? 'run',
          date: s.scheduledDate!,
          duration_minutes: parseInt(s.dur) || 0,
          tss: 0,
          planned: true,
          notes: s.description || s.metric || null,
        }))

      if (calendarRows.length > 0) {
        const { error: workoutsError } = await supabase.from('workouts').insert(calendarRows)
        if (workoutsError) throw workoutsError
      }

      onSuccess(`Plan generated. ${parsedSessions.filter(s => s.sport !== 'rest').length} sessions added to your calendar.`)
      onClose()
    } catch (err) {
      const msg =
        err instanceof Error ? err.message
        : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: unknown }).message)
        : 'Save failed. Please try again.'
      setImportError(msg || 'Save failed. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  const pillStyle = (active: boolean) => ({
    padding: '7px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer' as const,
    border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
    background: active ? `${COLORS.accent}18` : 'transparent',
    color: active ? COLORS.accent : COLORS.muted,
    transition: 'all 0.15s',
    fontFamily: 'Inter, Helvetica Neue, sans-serif',
  })

  const modalWidth = isMobile ? '100%' : step === 3 ? 820 : 680

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
        zIndex: 200,
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
      }}
      onClick={e => !isMobile && e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: COLORS.surface,
        border: isMobile ? 'none' : `1px solid ${COLORS.border}`,
        borderRadius: isMobile ? '18px 18px 0 0' : 18,
        width: modalWidth,
        maxWidth: isMobile ? '100%' : undefined,
        height: isMobile ? '95dvh' : step === 2 ? 'auto' : '88vh',
        maxHeight: isMobile ? '95dvh' : '88vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(14,165,233,0.12)',
        animation: 'fadeSlideUp 0.25s ease',
      }}>

        {/* ── Step 1 — Form ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{
              padding: isMobile ? '20px 20px 16px' : '22px 28px 20px',
              borderBottom: `1px solid ${COLORS.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.text }}>Generate Training Plan</div>
                <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 3 }}>Step 1 of 3 — Configure your plan</div>
              </div>
              <button onClick={onClose} style={{
                background: 'none', border: 'none', color: COLORS.muted,
                fontSize: 22, cursor: 'pointer', padding: '4px 8px', lineHeight: 1, borderRadius: 6,
              }}>×</button>
            </div>

            <div style={{
              flex: 1, overflowY: 'auto',
              padding: isMobile ? '20px' : '24px 28px',
              display: 'flex', flexDirection: 'column', gap: 22,
            }}>
              {generateError && (
                <div style={{
                  background: `${COLORS.orange}15`,
                  border: `1px solid ${COLORS.orange}40`,
                  borderRadius: 8, padding: '12px 14px',
                  fontSize: 13, color: COLORS.orange,
                }}>
                  {generateError}
                </div>
              )}

              {/* Sport */}
              <div>
                <label style={labelStyle}>Sport</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(['triathlon', 'run', 'bike', 'swim'] as SportType[]).map(s => (
                    <button key={s} style={pillStyle(sport === s)} onClick={() => setSport(s)}>
                      {s === 'triathlon' ? 'Triathlon' : s === 'run' ? 'Running' : s === 'bike' ? 'Cycling' : 'Swimming'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Level */}
              <div>
                <label style={labelStyle}>Experience Level</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {([
                    { value: 'beginner', label: 'Beginner', hint: 'New to the sport' },
                    { value: 'intermediate', label: 'Intermediate', hint: 'Training consistently' },
                    { value: 'advanced', label: 'Advanced', hint: 'Competitive athlete' },
                  ] as const).map(({ value, label, hint }) => (
                    <button
                      key={value}
                      style={{ ...pillStyle(level === value), display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, padding: '8px 14px' }}
                      onClick={() => setLevel(value)}
                    >
                      <span>{label}</span>
                      <span style={{ fontSize: 10, fontWeight: 400, color: level === value ? `${COLORS.accent}cc` : COLORS.subtle }}>{hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Race distance */}
              <div>
                <label style={labelStyle}>Race Distance</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {RACE_DISTANCES[sport].map(d => (
                    <button key={d} style={pillStyle(raceDistance === d)} onClick={() => setRaceDistance(d)}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Race Date</label>
                  <input
                    type="date"
                    className="plans-field-input"
                    value={raceDate}
                    onChange={e => setRaceDate(e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Plan Start Date</label>
                  <input
                    type="date"
                    className="plans-field-input"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Available training days */}
              <div>
                <label style={labelStyle}>Days Available to Train</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DAYS_OF_WEEK.map(({ short, full }) => (
                    <button key={full} style={pillStyle(preferredDays.includes(full))} onClick={() => toggleDay(full)}>
                      {short}
                    </button>
                  ))}
                </div>
              </div>

              {/* Goal time */}
              <div>
                <label style={labelStyle}>
                  Goal Time{' '}
                  <span style={{ color: COLORS.subtle, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  className="plans-field-input"
                  placeholder="e.g. 2:10:00"
                  value={goalTime}
                  onChange={e => setGoalTime(e.target.value)}
                />
              </div>

              {/* Current fitness */}
              <div style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 10,
                padding: '12px 16px',
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: COLORS.muted,
                  letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10,
                }}>
                  Your Current Fitness
                </div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 10, color: COLORS.muted, marginBottom: 2 }}>CTL</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: COLORS.text }}>
                      {Math.round(fitness.ctl)}
                    </div>
                  </div>
                  {profile?.ftp && (
                    <div>
                      <div style={{ fontSize: 10, color: COLORS.muted, marginBottom: 2 }}>FTP</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: COLORS.text }}>
                        {profile.ftp}W
                      </div>
                    </div>
                  )}
                  {profile?.run_pace && (
                    <div>
                      <div style={{ fontSize: 10, color: COLORS.muted, marginBottom: 2 }}>Run Threshold</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: COLORS.text }}>
                        {profile.run_pace}/km
                      </div>
                    </div>
                  )}
                  {profile?.css && (
                    <div>
                      <div style={{ fontSize: 10, color: COLORS.muted, marginBottom: 2 }}>CSS</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: COLORS.text }}>
                        {profile.css}/100m
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ padding: isMobile ? '16px 20px' : '18px 28px', borderTop: `1px solid ${COLORS.border}` }}>
              <button
                className="purple-glow-btn"
                onClick={handleGenerate}
                style={{ width: '100%', padding: 14, fontSize: 14 }}
              >
                Generate Plan →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 — Generating ── */}
        {step === 2 && (
          <div style={{
            flex: 1,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '40px', gap: 0,
          }}>
            <div style={{ position: 'relative', marginBottom: 36 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                border: `3px solid ${COLORS.accent}20`,
                borderTop: `3px solid ${COLORS.accent}`,
                animation: 'spin 0.9s linear infinite',
              }} />
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22,
              }}>✦</div>
            </div>

            <div style={{
              display: 'flex', flexDirection: 'column', gap: 14,
              minHeight: 120, alignSelf: 'center',
            }}>
              {generateMessages.map((msg, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  animation: 'msgAppear 0.35s ease',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: `${COLORS.accent}25`,
                    border: `1px solid ${COLORS.accent}60`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, color: COLORS.accent, flexShrink: 0,
                  }}>✓</div>
                  <span style={{
                    fontSize: 14,
                    color: i === generateMessages.length - 1 ? COLORS.text : COLORS.muted,
                    fontWeight: i === generateMessages.length - 1 ? 600 : 400,
                  }}>{msg}</span>
                </div>
              ))}

              {generateMessages.length < GENERATE_MESSAGES.length && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: `${COLORS.accent}10`,
                    border: `1px solid ${COLORS.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, color: COLORS.muted, flexShrink: 0,
                    animation: 'pulse-ring 1.4s ease-in-out infinite',
                  }}>·</div>
                  <span style={{ fontSize: 14, color: COLORS.muted }}>
                    {GENERATE_MESSAGES[generateMessages.length]}
                  </span>
                </div>
              )}
            </div>

            <div style={{
              width: 280, marginTop: 32,
              background: COLORS.subtle, borderRadius: 4, height: 3, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${(generateMessages.length / GENERATE_MESSAGES.length) * 100}%`,
                background: COLORS.accent,
                borderRadius: 4,
                transition: 'width 0.5s ease',
                boxShadow: `0 0 8px ${COLORS.accent}`,
              }} />
            </div>
          </div>
        )}

        {/* ── Step 3 — Review ── */}
        {step === 3 && (
          <ImportReviewScreen
            parsedSessions={parsedSessions}
            formData={{ startDate, raceDate, planName: parsedPlanName }}
            sportFilter={sportFilter}
            setSportFilter={setSportFilter}
            openWeeks={openWeeks}
            toggleWeek={toggleWeek}
            onClose={onClose}
            onImport={handleImport}
            importing={importing}
            importError={importError}
            isMobile={isMobile}
          />
        )}
      </div>
    </div>
  )
}
