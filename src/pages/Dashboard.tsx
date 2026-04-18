import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkouts } from '../contexts/WorkoutsContext'
import { useProfile } from '../contexts/ProfileContext'
import { StatCard } from '../components/dashboard/StatCard'
import { COLORS } from '../lib/colors'
import { workoutTypes } from '../components/ui/Badge'
import { useIsMobile } from '../hooks/useIsMobile'
import type { Workout } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDuration(minutes: number): string {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatUpcomingDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  d.setHours(0,0,0,0)
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TodayWorkoutCard({ workout, onComplete, completing, onCoachClick }: {
  workout: Workout
  onComplete: (w: Workout) => void
  completing: boolean
  onCoachClick: () => void
}) {
  const wt = workoutTypes[workout.type]
  return (
    <div style={{
      background: COLORS.card,
      borderTop: `1px solid ${COLORS.border}`,
      borderRight: `1px solid ${COLORS.border}`,
      borderBottom: `1px solid ${COLORS.border}`,
      borderLeft: `3px solid ${wt.color}`,
      borderRadius: 12,
      padding: '20px 24px',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 10, flexShrink: 0,
          background: wt.color + '20',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>
          {wt.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: wt.color, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>
            Today's Workout
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {workout.title}
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 3, display: 'flex', gap: 10 }}>
            {workout.duration_minutes > 0 && <span>{formatDuration(workout.duration_minutes)}</span>}
            {workout.tss > 0 && <span>{workout.tss} TSS</span>}
            {workout.zone && <span>{workout.zone}</span>}
            {workout.notes && <span style={{ fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{workout.notes}</span>}
          </div>
        </div>
        <button
          onClick={() => onComplete(workout)}
          disabled={completing}
          style={{
            flexShrink: 0,
            padding: '9px 18px',
            borderRadius: 8,
            border: `1px solid ${COLORS.green}`,
            background: completing ? COLORS.green + '20' : COLORS.green + '15',
            color: COLORS.green,
            fontSize: 12, fontWeight: 700, cursor: completing ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s', fontFamily: 'inherit', opacity: completing ? 0.6 : 1,
          }}
        >
          {completing ? 'Saving…' : '✓ Mark Complete'}
        </button>
      </div>
      <CoachBanner onClick={onCoachClick} />
    </div>
  )
}

function CoachBanner({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 14,
        paddingTop: 12,
        borderTop: `1px solid ${COLORS.border}`,
        background: 'none',
        border: 'none',
        borderRadius: 0,
        cursor: 'pointer',
        fontFamily: 'inherit',
        padding: '12px 0 0',
        width: '100%',
      }}
    >
      <span style={{ fontSize: 11, color: COLORS.accent }}>✦</span>
      <span style={{ fontSize: 11, color: COLORS.muted, transition: 'color 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.color = COLORS.accent)}
        onMouseLeave={e => (e.currentTarget.style.color = COLORS.muted)}
      >
        View your AI coaching briefing →
      </span>
    </button>
  )
}

function RestDayCard({ completedToday, onCoachClick }: { completedToday: Workout[]; onCoachClick: () => void }) {
  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: '18px 24px',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: COLORS.subtle,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}>
          {completedToday.length > 0 ? '✓' : '—'}
        </div>
        <div>
          <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
            Today
          </div>
          {completedToday.length > 0 ? (
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.green }}>
              {completedToday.length} workout{completedToday.length > 1 ? 's' : ''} completed
              <span style={{ color: COLORS.muted, fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                {completedToday.reduce((s, w) => s + (w.tss || 0), 0)} TSS
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.muted }}>No workout scheduled — rest day</div>
          )}
        </div>
      </div>
      <CoachBanner onClick={onCoachClick} />
    </div>
  )
}

function RaceCountdownCard({ goal, date }: { goal?: string; date?: string }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const raceDate = date ? new Date(date + 'T00:00:00') : null
  const days = raceDate ? Math.ceil((raceDate.getTime() - today.getTime()) / 86400000) : null

  if (!goal || days === null || days < 0) {
    return (
      <div style={{
        background: COLORS.card, border: `1px solid ${COLORS.border}`,
        borderRadius: 12, padding: '20px 24px', flex: 1, minWidth: 140,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: COLORS.muted, opacity: 0.4 }} />
        <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Race Goal</div>
        <div style={{ fontSize: 13, color: COLORS.muted }}>Set in profile settings</div>
      </div>
    )
  }

  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${COLORS.border}`,
      borderRadius: 12, padding: '20px 24px', flex: 1, minWidth: 140,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: COLORS.purple, opacity: 0.8 }} />
      <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Race Goal</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 32, fontWeight: 800, color: COLORS.text, fontFamily: "'DM Mono', monospace" }}>{days}</span>
        <span style={{ color: COLORS.muted, fontSize: 13 }}>days</span>
      </div>
      <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: COLORS.purple, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {goal}
      </div>
      <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 2 }}>
        {raceDate!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </div>
    </div>
  )
}

function WeeklyProgressCard({ weekWorkouts }: { weekWorkouts: Workout[] }) {
  const actual = weekWorkouts.filter(w => !w.planned).reduce((s, w) => s + (w.tss || 0), 0)
  const planned = weekWorkouts.filter(w => w.planned).reduce((s, w) => s + (w.tss || 0), 0)
  const target = actual + planned
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0

  // Build Mon–Sun day breakdown
  const now = new Date()
  const dow = now.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    d.setHours(0, 0, 0, 0)
    const key = localDateKey(d)
    const dayWorkouts = weekWorkouts.filter(w => w.date.split('T')[0] === key)
    const done = dayWorkouts.filter(w => !w.planned)
    const pending = dayWorkouts.filter(w => w.planned)
    const isPast = d.getTime() < now.setHours(0, 0, 0, 0)
    const isToday = d.getTime() === new Date().setHours(0, 0, 0, 0)
    const label = ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]
    return { label, done, pending, isPast, isToday, key }
  })

  const sportColor = (type: string) => workoutTypes[type as keyof typeof workoutTypes]?.color ?? COLORS.muted

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '20px 24px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
        Weekly Load
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: COLORS.muted }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: COLORS.text, fontSize: 14 }}>{actual}</span>
          {target > 0 && <span> / {target} TSS</span>}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: pct >= 80 ? COLORS.green : pct >= 50 ? COLORS.accent : COLORS.muted }}>
          {target > 0 ? `${pct}%` : 'No load planned'}
        </div>
      </div>
      <div style={{ height: 6, background: COLORS.subtle, borderRadius: 4, marginBottom: 20, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 4, transition: 'width 0.4s ease',
          width: `${pct}%`,
          background: pct >= 80 ? COLORS.green : COLORS.accent,
        }} />
      </div>

      {/* Day dots */}
      <div style={{ display: 'flex', gap: 6 }}>
        {days.map((day, i) => {
          const primaryWorkout = day.done[0] ?? day.pending[0]
          const color = primaryWorkout ? sportColor(primaryWorkout.type) : COLORS.border
          const isDone = day.done.length > 0
          const hasPending = day.pending.length > 0 && day.done.length === 0

          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: '100%', aspectRatio: '1',
                borderRadius: 5,
                background: isDone ? color + '30' : 'transparent',
                border: `1px solid ${isDone ? color : hasPending ? color + '60' : COLORS.border}`,
                borderStyle: hasPending ? 'dashed' : 'solid',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13,
              }}>
                {isDone && <span style={{ color }}>✓</span>}
                {hasPending && <span style={{ color: color + '90', fontSize: 10 }}>○</span>}
              </div>
              <div style={{ fontSize: 9, color: day.isToday ? COLORS.accent : COLORS.muted, fontWeight: day.isToday ? 700 : 400, letterSpacing: '0.06em' }}>
                {day.label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function UpcomingDaysCard({ workouts }: { workouts: Workout[] }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '20px 24px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
        Coming Up
      </div>
      {workouts.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
          No planned workouts in the next 4 days
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {workouts.map(w => {
            const wt = workoutTypes[w.type]
            return (
              <div key={w.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px',
                background: COLORS.bg,
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 7, flexShrink: 0,
                  background: wt.color + '20',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15,
                }}>
                  {wt.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {w.title}
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 1 }}>
                    {formatUpcomingDate(w.date)}{w.duration_minutes > 0 ? ` · ${formatDuration(w.duration_minutes)}` : ''}
                  </div>
                </div>
                {w.tss > 0 && (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: wt.color, fontFamily: "'DM Mono', monospace" }}>{w.tss}</div>
                    <div style={{ fontSize: 9, color: COLORS.muted }}>TSS</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { loading, updateWorkout, getTodaysWorkouts, getWorkoutsForWeek, calculateFitnessMetrics, getUpcomingWorkouts } = useWorkouts()
  const { profile } = useProfile()
  const [completing, setCompleting] = useState<string | null>(null)
  const isMobile = useIsMobile()
  const navigate = useNavigate()

  const todaysWorkouts = getTodaysWorkouts()
  const todayPlanned = todaysWorkouts.filter(w => w.planned)
  const todayCompleted = todaysWorkouts.filter(w => !w.planned)
  const weekWorkouts = getWorkoutsForWeek()
  const { ctl, atl, tsb } = calculateFitnessMetrics()

  // Upcoming next 4 days (excluding today)
  const todayKey = localDateKey(new Date())
  const upcoming = getUpcomingWorkouts(5)
    .filter(w => w.date.split('T')[0] !== todayKey)
    .slice(0, 4)

  const handleMarkComplete = async (workout: Workout) => {
    setCompleting(workout.id)
    try {
      await updateWorkout(workout.id, { planned: false })
    } finally {
      setCompleting(null)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: COLORS.muted }}>
        Loading…
      </div>
    )
  }

  return (
    <>
      {/* Today's workout */}
      {todayPlanned.length > 0
        ? <TodayWorkoutCard workout={todayPlanned[0]} onComplete={handleMarkComplete} completing={completing === todayPlanned[0].id} onCoachClick={() => navigate('/ai-coach')} />
        : <RestDayCard completedToday={todayCompleted} onCoachClick={() => navigate('/ai-coach')} />
      }

      {/* Stat cards + race countdown */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: isMobile ? 10 : 14,
        marginBottom: 20,
      }}>
        <StatCard label="Fitness (CTL)" value={ctl} color={COLORS.accent} hint={ctl < 10 ? 'Log more workouts to build your score' : undefined} />
        <StatCard label="Fatigue (ATL)" value={atl} color={COLORS.orange} hint={atl < 10 ? 'Log more workouts to build your score' : undefined} />
        <StatCard label="Form (TSB)" value={tsb} color={COLORS.green} />
        <RaceCountdownCard goal={profile?.race_goal} date={profile?.race_date} />
      </div>

      {/* Weekly progress + upcoming */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
        <WeeklyProgressCard weekWorkouts={weekWorkouts} />
        <UpcomingDaysCard workouts={upcoming} />
      </div>
    </>
  )
}
