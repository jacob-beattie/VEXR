import { COLORS } from '../../lib/colors'
import { workoutTypes } from '../ui/Badge'
import type { Workout } from '../../types'
import { formatDuration, formatUpcomingDay } from './utils'

export function ComingUpCard({ workouts, onSelect }: { workouts: Workout[], onSelect: (w: Workout) => void }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
        Coming Up
      </div>
      {workouts.length === 0 ? (
        <div style={{
          background: COLORS.subtle,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 10,
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>📅</span>
          <span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 500 }}>No planned workouts ahead</span>
          <span style={{ color: COLORS.muted, fontSize: 11, opacity: 0.7 }}>Add a training plan to populate your calendar</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {workouts.map(w => {
            const wt = workoutTypes[w.type]
            return (
              <div
                key={w.id}
                onClick={() => onSelect(w)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px',
                  background: COLORS.surface, borderRadius: 9,
                  borderTop: `1px solid ${COLORS.border}`,
                  borderRight: `1px solid ${COLORS.border}`,
                  borderBottom: `1px solid ${COLORS.border}`,
                  borderLeft: `3px solid ${wt.color}`,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = `0 4px 12px ${wt.shadowColor}, 0 1px 4px rgba(0,0,0,0.06)`
                  e.currentTarget.style.borderTopColor = wt.darkBorder
                  e.currentTarget.style.borderRightColor = wt.darkBorder
                  e.currentTarget.style.borderBottomColor = wt.darkBorder
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'
                  e.currentTarget.style.borderTopColor = COLORS.border
                  e.currentTarget.style.borderRightColor = COLORS.border
                  e.currentTarget.style.borderBottomColor = COLORS.border
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 7, flexShrink: 0,
                  background: wt.bg,
                  border: `1.5px solid ${wt.darkBorder}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15,
                }}>
                  {wt.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: wt.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                    {wt.label}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {w.title}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                    {formatUpcomingDay(w.date)}{w.duration_minutes > 0 ? ` · ${formatDuration(w.duration_minutes)}` : ''}
                  </div>
                </div>
                {w.tss > 0 && (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: wt.color, fontFamily: "'DM Mono', monospace" }}>{w.tss}</div>
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
