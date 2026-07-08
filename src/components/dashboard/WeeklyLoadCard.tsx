import { COLORS } from '../../lib/colors'
import { workoutTypes } from '../ui/Badge'
import type { Workout } from '../../types'
import { localDateKey } from './utils'

export function WeeklyLoadCard({ weekWorkouts, onDayClick }: { weekWorkouts: Workout[], onDayClick: (date: Date, workouts: Workout[]) => void }) {
  const actual = weekWorkouts.filter(w => !w.planned).reduce((s, w) => s + (w.tss || 0), 0)
  const planned = weekWorkouts.filter(w => w.planned).reduce((s, w) => s + (w.tss || 0), 0)
  const target = actual + planned
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0

  const now = new Date()
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay()
  const monday = new Date(now); monday.setDate(now.getDate() + diff); monday.setHours(0, 0, 0, 0)

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); d.setHours(0, 0, 0, 0)
    const key = localDateKey(d)
    const dw = weekWorkouts.filter(w => w.date.split('T')[0] === key)
    const done = dw.filter(w => !w.planned)
    const pending = dw.filter(w => w.planned)
    return { label: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i], done, pending, isToday: localDateKey(new Date()) === key, date: d, all: dw }
  })

  const sportColor = (type: string) => workoutTypes[type as keyof typeof workoutTypes]?.color ?? COLORS.muted

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
        Weekly Load
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: COLORS.muted }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: COLORS.text, fontSize: 16 }}>{actual}</span>
          {target > 0 && <span style={{ fontSize: 12 }}> / {target} TSS</span>}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: pct >= 80 ? COLORS.green : pct >= 50 ? COLORS.accent : COLORS.muted }}>
          {target > 0 ? `${pct}%` : 'No load planned'}
        </div>
      </div>
      <div style={{ height: 6, background: COLORS.subtle, borderRadius: 4, marginBottom: 18, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 4, transition: 'width 0.4s ease',
          width: `${pct}%`,
          background: pct >= 80 ? COLORS.green : COLORS.accent,
        }} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {days.map((day, i) => {
          const primary = day.done[0] ?? day.pending[0]
          const color = primary ? sportColor(primary.type) : COLORS.border
          const isDone = day.done.length > 0
          const hasPending = day.pending.length > 0 && !isDone
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div
                onClick={() => day.all.length > 0 && onDayClick(day.date, day.all)}
                style={{
                  width: '100%', aspectRatio: '1', borderRadius: 6,
                  background: isDone ? color + '28' : 'transparent',
                  border: `1px ${hasPending ? 'dashed' : 'solid'} ${isDone ? color : hasPending ? color + '70' : COLORS.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12,
                  cursor: day.all.length > 0 ? 'pointer' : 'default',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => { if (day.all.length > 0) e.currentTarget.style.opacity = '0.75' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                {isDone && <span style={{ color }}>✓</span>}
                {hasPending && <span style={{ color: color + '90', fontSize: 9 }}>○</span>}
              </div>
              <div style={{ fontSize: 9, color: day.isToday ? COLORS.accent : COLORS.muted, fontWeight: day.isToday ? 700 : 400 }}>
                {day.label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
