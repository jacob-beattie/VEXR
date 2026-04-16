import { useEffect } from 'react'
import { COLORS } from '../../lib/colors'
import { workoutTypes } from '../ui/Badge'
import type { Workout } from '../../types'

interface DayBottomSheetProps {
  date: Date
  workouts: Workout[]
  onSelectWorkout: (w: Workout) => void
  onAddWorkout: () => void
  onClose: () => void
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatDuration(minutes: number): string {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function DayBottomSheet({ date, workouts, onSelectWorkout, onAddWorkout, onClose }: DayBottomSheetProps) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 105,
          background: 'rgba(0,0,0,0.5)',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 110,
        background: COLORS.card,
        borderRadius: '18px 18px 0 0',
        border: `1px solid ${COLORS.border}`,
        borderBottom: 'none',
        maxHeight: '78vh',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: COLORS.border }} />
        </div>

        {/* Header */}
        <div style={{
          padding: '10px 20px 14px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.text }}>
              {DAYS_FULL[date.getDay()]}, {MONTHS[date.getMonth()]} {date.getDate()}
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 3 }}>
              {workouts.length} workout{workouts.length !== 1 ? 's' : ''}
              {workouts.length > 0 && (
                <span style={{ marginLeft: 6, color: COLORS.accent, fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>
                  · {workouts.reduce((s, w) => s + (w.tss || 0), 0)} TSS total
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: COLORS.muted,
              fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Workout list */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {workouts.map(w => {
            const wt = workoutTypes[w.type]
            return (
              <div
                key={w.id}
                onClick={() => onSelectWorkout(w)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px',
                  background: COLORS.surface,
                  borderTop: `1px solid ${COLORS.border}`,
                  borderRight: `1px solid ${COLORS.border}`,
                  borderBottom: `1px solid ${COLORS.border}`,
                  borderLeft: `3px solid ${wt.color}`,
                  borderRadius: 10,
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
                onTouchStart={e => (e.currentTarget.style.background = wt.color + '10')}
                onTouchEnd={e => (e.currentTarget.style.background = COLORS.surface)}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                  background: wt.color + '20',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 19,
                }}>
                  {wt.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                    {w.title}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: COLORS.muted }}>{formatDuration(w.duration_minutes)}</span>
                    {w.tss > 0 && (
                      <span style={{ fontSize: 12, color: COLORS.accent, fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>
                        {w.tss} TSS
                      </span>
                    )}
                    {w.distance_meters && w.distance_meters > 0 && (
                      <span style={{ fontSize: 12, color: COLORS.green, fontFamily: 'DM Mono, monospace' }}>
                        {(w.distance_meters / 1000).toFixed(1)} km
                      </span>
                    )}
                    {w.planned && (
                      <span style={{ fontSize: 10, color: COLORS.accent, fontWeight: 700, background: COLORS.accentDim, borderRadius: 4, padding: '1px 5px' }}>
                        PLAN
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ color: COLORS.muted, fontSize: 18, flexShrink: 0 }}>›</div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 14px 20px', borderTop: `1px solid ${COLORS.border}` }}>
          <button
            onClick={onAddWorkout}
            style={{
              width: '100%', padding: '13px',
              background: COLORS.accentDim, border: `1px solid ${COLORS.accent}40`,
              borderRadius: 10, color: COLORS.accent,
              fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            + Log workout for this day
          </button>
        </div>
      </div>
    </>
  )
}
