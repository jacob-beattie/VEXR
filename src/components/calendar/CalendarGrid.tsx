import { COLORS } from '../../lib/colors'
import { CalendarDay } from './CalendarDay'
import { workoutTypes } from '../ui/Badge'
import type { Workout } from '../../types'

interface CalendarGridProps {
  workouts: Workout[]
  view: 'month' | 'week'
  year: number
  month: number
  weekStart: Date
  onPrevMonth: () => void
  onNextMonth: () => void
  onPrevWeek: () => void
  onNextWeek: () => void
  onViewChange: (v: 'month' | 'week') => void
  onDayClick?: (date: Date, workouts: Workout[]) => void
  onWorkoutClick?: (workout: Workout) => void
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDuration(minutes: number): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function CalendarGrid({
  workouts, view, year, month, weekStart,
  onPrevMonth, onNextMonth, onPrevWeek, onNextWeek,
  onViewChange, onDayClick, onWorkoutClick,
}: CalendarGridProps) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const todayKey = localDateKey(now)

  // ── View toggle ──────────────────────────────────────────────────────────────
  const toggleStyle = (active: boolean) => ({
    padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
    border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
    background: active ? COLORS.accentDim : 'transparent',
    color: active ? COLORS.accent : COLORS.muted,
  })

  // ── MONTH VIEW ───────────────────────────────────────────────────────────────
  if (view === 'month') {
    const firstDay = new Date(year, month, 1).getDay()
    const startOffset = firstDay === 0 ? 6 : firstDay - 1
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const calDays: (number | null)[] = [
      ...Array(startOffset).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ]
    while (calDays.length % 7 !== 0) calDays.push(null)

    const workoutsByDay = workouts.reduce<Record<number, Workout[]>>((acc, w) => {
      const d = new Date(w.date + 'T00:00:00')
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate()
        if (!acc[day]) acc[day] = []
        acc[day].push(w)
      }
      return acc
    }, {})

    const isToday = (day: number) =>
      day === now.getDate() && month === now.getMonth() && year === now.getFullYear()

    return (
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.text }}>{MONTHS[month]} {year}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', borderRadius: 7, border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>
              <button style={toggleStyle(true)} onClick={() => onViewChange('month')}>Month</button>
              <button style={{ ...toggleStyle(false), borderLeft: `1px solid ${COLORS.border}`, borderRadius: 0 }} onClick={() => onViewChange('week')}>Week</button>
            </div>
            <button onClick={onPrevMonth} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.text, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>← Prev</button>
            <button onClick={onNextMonth} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.text, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>Next →</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
          {DAYS.map(d => (
            <div key={d} style={{ fontSize: 10, fontWeight: 700, color: COLORS.muted, textAlign: 'center', letterSpacing: '0.1em', padding: '4px 0' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {calDays.map((day, i) => {
            const dayWorkouts = day ? (workoutsByDay[day] ?? []) : []
            return (
              <CalendarDay
                key={i}
                day={day}
                workouts={dayWorkouts}
                isToday={day !== null && isToday(day)}
                onClick={() => {
                  if (day && onDayClick) onDayClick(new Date(year, month, day), dayWorkouts)
                }}
              />
            )
          })}
        </div>
      </div>
    )
  }

  // ── WEEK VIEW ────────────────────────────────────────────────────────────────
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  const workoutsByKey = workouts.reduce<Record<string, Workout[]>>((acc, w) => {
    const key = w.date.split('T')[0]
    if (!acc[key]) acc[key] = []
    acc[key].push(w)
    return acc
  }, {})

  const weekEnd = weekDays[6]
  const headerLabel = weekStart.getMonth() === weekEnd.getMonth()
    ? `${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    : `${SHORT_MONTHS[weekStart.getMonth()]} – ${SHORT_MONTHS[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, flex: 1, minWidth: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.text }}>{headerLabel}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', borderRadius: 7, border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>
            <button style={toggleStyle(false)} onClick={() => onViewChange('month')}>Month</button>
            <button style={{ ...toggleStyle(true), borderLeft: `1px solid ${COLORS.border}`, borderRadius: 0 }} onClick={() => onViewChange('week')}>Week</button>
          </div>
          <button onClick={onPrevWeek} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.text, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>← Prev</button>
          <button onClick={onNextWeek} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.text, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>Next →</button>
        </div>
      </div>

      {/* Day columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {weekDays.map((date) => {
          const key = localDateKey(date)
          const isToday = key === todayKey
          const dayWorkouts = workoutsByKey[key] ?? []
          const isFuture = date > now

          return (
            <div
              key={key}
              style={{ display: 'flex', flexDirection: 'column', minHeight: 320 }}
            >
              {/* Day header */}
              <div
                onClick={() => onDayClick?.(date, dayWorkouts)}
                style={{
                  textAlign: 'center', padding: '12px 6px 14px',
                  borderRadius: '8px 8px 0 0',
                  background: isToday ? COLORS.accentDim : 'transparent',
                  border: `1px solid ${isToday ? COLORS.accent : COLORS.border}`,
                  borderBottom: 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? COLORS.accent : COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {DAYS[(date.getDay() + 6) % 7]}
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: isToday ? COLORS.accent : isFuture ? COLORS.muted : COLORS.text, lineHeight: 1.1, marginTop: 4 }}>
                  {date.getDate()}
                </div>
                <div style={{ fontSize: 11, color: isToday ? COLORS.accent : COLORS.muted, marginTop: 1 }}>
                  {SHORT_MONTHS[date.getMonth()]}
                </div>
              </div>

              {/* Workouts area */}
              <div
                onClick={() => { if (dayWorkouts.length === 0) onDayClick?.(date, []) }}
                style={{
                  flex: 1,
                  border: `1px solid ${isToday ? COLORS.accent : COLORS.border}`,
                  borderTop: 'none',
                  borderRadius: '0 0 8px 8px',
                  padding: '8px 7px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                  cursor: dayWorkouts.length === 0 ? 'pointer' : 'default',
                  background: isToday ? COLORS.accentDim + '44' : COLORS.surface,
                  minHeight: 240,
                }}
              >
                {dayWorkouts.length === 0 && (
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: COLORS.border, fontSize: 24, fontWeight: 300,
                  }}>
                    +
                  </div>
                )}
                {dayWorkouts.map(workout => {
                  const wt = workoutTypes[workout.type]
                  return (
                    <div
                      key={workout.id}
                      onClick={(e) => { e.stopPropagation(); onWorkoutClick?.(workout) }}
                      style={{
                        background: wt.color + '12',
                        border: `1px solid ${wt.color}30`,
                        borderLeft: `4px solid ${wt.color}`,
                        borderRadius: 7,
                        padding: '10px 10px',
                        cursor: 'pointer',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = wt.color + '22')}
                      onMouseLeave={e => (e.currentTarget.style.background = wt.color + '12')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: wt.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {wt.icon} {wt.label}
                        </span>
                        {workout.planned && (
                          <span style={{ fontSize: 10, color: COLORS.accent, fontWeight: 700, background: COLORS.accentDim, borderRadius: 4, padding: '1px 5px' }}>PLAN</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6, lineHeight: 1.3 }}>
                        {workout.title}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {workout.duration_minutes > 0 && (
                          <span style={{ fontSize: 12, color: COLORS.muted, fontFamily: 'DM Mono, monospace' }}>{formatDuration(workout.duration_minutes)}</span>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {workout.tss > 0 && (
                            <span style={{ fontSize: 12, color: COLORS.accent, fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>{workout.tss} TSS</span>
                          )}
                          {workout.distance_meters && workout.distance_meters > 0 && (
                            <span style={{ fontSize: 11, color: COLORS.green, fontFamily: 'DM Mono, monospace' }}>{(workout.distance_meters / 1000).toFixed(1)}km</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
