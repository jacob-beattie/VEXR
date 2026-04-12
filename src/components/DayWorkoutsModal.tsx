import { COLORS } from '../lib/colors'
import { workoutTypes } from './ui/Badge'
import type { Workout } from '../types'

interface DayWorkoutsModalProps {
  date: Date
  workouts: Workout[]
  onSelectWorkout: (workout: Workout) => void
  onAddWorkout: () => void
  onClose: () => void
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatDuration(minutes: number): string {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function DayWorkoutsModal({ date, workouts, onSelectWorkout, onAddWorkout, onClose }: DayWorkoutsModalProps) {
  const label = `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
  const totalTss = workouts.reduce((s, w) => s + (w.tss || 0), 0)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          width: '100%',
          maxWidth: 420,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.text }}>{label}</div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 3 }}>
              {workouts.length} workout{workouts.length !== 1 ? 's' : ''}
              {totalTss > 0 && ` · ${totalTss} TSS total`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: COLORS.muted, fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Workout list */}
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {workouts.map(workout => {
            const wt = workoutTypes[workout.type]
            return (
              <button
                key={workout.id}
                onClick={() => onSelectWorkout(workout)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 14px',
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 10,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'border-color 0.12s, background 0.12s',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = wt.color + '60'
                  ;(e.currentTarget as HTMLButtonElement).style.background = wt.color + '0d'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = COLORS.border
                  ;(e.currentTarget as HTMLButtonElement).style.background = COLORS.surface
                }}
              >
                {/* Left colour strip */}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: wt.color }} />

                <div style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: wt.color + '20',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17, flexShrink: 0,
                }}>
                  {wt.icon}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {workout.title}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                    {formatDuration(workout.duration_minutes)}
                    {workout.tss > 0 && ` · ${workout.tss} TSS`}
                    {workout.zone && ` · ${workout.zone}`}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {workout.planned && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.accent, background: COLORS.accentDim, borderRadius: 4, padding: '2px 6px' }}>
                      PLANNED
                    </span>
                  )}
                  <span style={{ color: COLORS.muted, fontSize: 16, lineHeight: 1 }}>›</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${COLORS.border}` }}>
          <button
            onClick={onAddWorkout}
            style={{
              width: '100%', padding: '10px 14px',
              background: 'transparent',
              border: `1px dashed ${COLORS.border}`,
              borderRadius: 10, color: COLORS.muted,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              transition: 'border-color 0.12s, color 0.12s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = COLORS.accent + '60'
              ;(e.currentTarget as HTMLButtonElement).style.color = COLORS.accent
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = COLORS.border
              ;(e.currentTarget as HTMLButtonElement).style.color = COLORS.muted
            }}
          >
            + Add another workout
          </button>
        </div>
      </div>
    </div>
  )
}
