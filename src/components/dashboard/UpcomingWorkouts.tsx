import { COLORS } from '../../lib/colors'
import { Badge, workoutTypes } from '../ui/Badge'
import type { Workout } from '../../types'

interface UpcomingWorkoutsProps {
  workouts: Workout[]
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)

  if (d.getTime() === today.getTime()) return 'Today'
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow'
  return date.toLocaleDateString('en-US', { weekday: 'long' })
}

function formatDuration(minutes: number): string {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function UpcomingWorkouts({ workouts }: UpcomingWorkoutsProps) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '20px 24px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
        Upcoming Workouts
      </div>
      {workouts.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
          No upcoming planned workouts
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {workouts.map(w => {
            const wt = workoutTypes[w.type]
            return (
              <div
                key={w.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '12px 16px',
                  background: COLORS.surface,
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: wt.color + '20',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, flexShrink: 0,
                }}>
                  {wt.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{w.title}</div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 1 }}>
                    {formatDate(w.date)} · {formatDuration(w.duration_minutes)}{w.zone ? ` · ${w.zone}` : ''}
                  </div>
                </div>
                <Badge type={w.type} />
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: wt.color, fontFamily: 'monospace' }}>{w.tss}</div>
                  <div style={{ fontSize: 10, color: COLORS.muted }}>TSS</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
