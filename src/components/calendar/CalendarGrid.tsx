import { COLORS } from '../../lib/colors'
import { CalendarDay } from './CalendarDay'
import { workoutTypes } from '../ui/Badge'
import { useIsMobile } from '../../hooks/useIsMobile'
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
  const isMobile = useIsMobile()

  // ── View toggle ──────────────────────────────────────────────────────────────
  const toggleStyle = (active: boolean) => ({
    padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
    borderTop: `1px solid ${active ? COLORS.accent : COLORS.border}`,
    borderRight: `1px solid ${active ? COLORS.accent : COLORS.border}`,
    borderBottom: `1px solid ${active ? COLORS.accent : COLORS.border}`,
    borderLeft: `1px solid ${active ? COLORS.accent : COLORS.border}`,
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
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: isMobile ? 12 : 24, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.text }}>{MONTHS[month]} {year}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ display: 'flex', borderRadius: 7, border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>
              <button style={toggleStyle(true)} onClick={() => onViewChange('month')}>Month</button>
              <button style={{ ...toggleStyle(false), borderLeft: `1px solid ${COLORS.border}`, borderRadius: 0 }} onClick={() => onViewChange('week')}>Week</button>
            </div>
            <button onClick={onPrevMonth} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.text, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}>←</button>
            <button onClick={onNextMonth} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.text, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}>→</button>
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
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: isMobile ? 12 : 24, flex: 1, minWidth: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.text }}>{headerLabel}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ display: 'flex', borderRadius: 7, border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>
            <button style={toggleStyle(false)} onClick={() => onViewChange('month')}>Month</button>
            <button style={{ ...toggleStyle(true), borderLeft: `1px solid ${COLORS.border}`, borderRadius: 0 }} onClick={() => onViewChange('week')}>Week</button>
          </div>
          <button onClick={onPrevWeek} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.text, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}>←</button>
          <button onClick={onNextWeek} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.text, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}>→</button>
        </div>
      </div>

      {/* Day columns — stack vertically on mobile */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(7, 1fr)',
        gap: isMobile ? 10 : 8,
      }}>
        {weekDays.map((date) => {
          const key = localDateKey(date)
          const isToday = key === todayKey
          const dayWorkouts = workoutsByKey[key] ?? []
          const isFuture = date > now

          return (
            <div
              key={key}
              style={{ display: 'flex', flexDirection: 'column', minHeight: isMobile ? 0 : 320 }}
            >
              {/* Day header */}
              <div
                onClick={() => onDayClick?.(date, dayWorkouts)}
                style={{
                  textAlign: isMobile ? 'left' : 'center',
                  padding: isMobile ? '10px 12px' : '12px 6px 14px',
                  borderRadius: isMobile ? 8 : '8px 8px 0 0',
                  background: isToday ? COLORS.accentDim : 'transparent',
                  border: `1px solid ${isToday ? COLORS.accent : COLORS.border}`,
                  borderBottom: isMobile ? undefined : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: isMobile ? 10 : 0,
                  flexDirection: isMobile ? 'row' : 'column',
                }}
              >
                <div style={{
                  fontSize: isMobile ? 20 : 26, fontWeight: 800,
                  color: isToday ? COLORS.accent : isFuture ? COLORS.muted : COLORS.text,
                  lineHeight: 1, fontFamily: "'DM Mono', monospace",
                }}>
                  {date.getDate()}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? COLORS.accent : COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {DAYS[(date.getDay() + 6) % 7]}
                  </div>
                  {isMobile && (
                    <div style={{ fontSize: 10, color: isToday ? COLORS.accent : COLORS.muted, marginTop: 1 }}>
                      {SHORT_MONTHS[date.getMonth()]}
                    </div>
                  )}
                  {!isMobile && (
                    <div style={{ fontSize: 11, color: isToday ? COLORS.accent : COLORS.muted, marginTop: 1 }}>
                      {SHORT_MONTHS[date.getMonth()]}
                    </div>
                  )}
                </div>
                {isMobile && dayWorkouts.length > 0 && (
                  <div style={{ marginLeft: 'auto', fontSize: 11, color: COLORS.muted }}>
                    {dayWorkouts.length} workout{dayWorkouts.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>

              {/* Workouts area */}
              <div
                onClick={() => { if (dayWorkouts.length === 0) onDayClick?.(date, []) }}
                style={{
                  flex: isMobile ? undefined : 1,
                  border: isMobile ? 'none' : `1px solid ${isToday ? COLORS.accent : COLORS.border}`,
                  borderTop: 'none',
                  borderRadius: isMobile ? 0 : '0 0 8px 8px',
                  padding: isMobile ? (dayWorkouts.length > 0 ? '8px 0 0' : '0') : '8px 7px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: isMobile ? 8 : 7,
                  cursor: dayWorkouts.length === 0 ? 'pointer' : 'default',
                  background: isMobile ? 'transparent' : (isToday ? COLORS.accentDim + '44' : COLORS.surface),
                  minHeight: isMobile ? 0 : 240,
                }}
              >
                {!isMobile && dayWorkouts.length === 0 && (
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: COLORS.border, fontSize: 24, fontWeight: 300,
                  }}>
                    +
                  </div>
                )}
                {dayWorkouts.map(workout => {
                  const wt = workoutTypes[workout.type]
                  if (isMobile) {
                    // Mobile: spacious horizontal card
                    return (
                      <div
                        key={workout.id}
                        onClick={(e) => { e.stopPropagation(); onWorkoutClick?.(workout) }}
                        style={{
                          background: wt.color + '10',
                          borderTop: `1px solid ${wt.color}30`,
                          borderRight: `1px solid ${wt.color}30`,
                          borderBottom: `1px solid ${wt.color}30`,
                          borderLeft: `4px solid ${wt.color}`,
                          borderRadius: 10,
                          padding: '12px 14px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <div style={{
                          width: 40, height: 40, borderRadius: 9, flexShrink: 0,
                          background: wt.color + '20',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 20,
                        }}>
                          {wt.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: wt.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {wt.label}
                            </span>
                            {workout.planned && (
                              <span style={{ fontSize: 10, color: COLORS.accent, fontWeight: 700, background: COLORS.accentDim, borderRadius: 4, padding: '1px 5px' }}>PLAN</span>
                            )}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2, marginBottom: 4 }}>
                            {workout.title}
                          </div>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            {workout.duration_minutes > 0 && (
                              <span style={{ fontSize: 13, color: COLORS.muted, fontFamily: 'DM Mono, monospace' }}>{formatDuration(workout.duration_minutes)}</span>
                            )}
                            {workout.tss > 0 && (
                              <span style={{ fontSize: 13, color: COLORS.accent, fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>{workout.tss} TSS</span>
                            )}
                            {workout.distance_meters && workout.distance_meters > 0 && (
                              <span style={{ fontSize: 13, color: COLORS.green, fontFamily: 'DM Mono, monospace' }}>{(workout.distance_meters / 1000).toFixed(1)} km</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  }
                  // Desktop: compact column card
                  return (
                    <div
                      key={workout.id}
                      onClick={(e) => { e.stopPropagation(); onWorkoutClick?.(workout) }}
                      style={{
                        background: wt.color + '12',
                        borderTop: `1px solid ${wt.color}30`,
                        borderRight: `1px solid ${wt.color}30`,
                        borderBottom: `1px solid ${wt.color}30`,
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
