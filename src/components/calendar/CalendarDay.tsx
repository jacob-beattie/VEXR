import { useState } from 'react'
import { COLORS } from '../../lib/colors'
import { workoutTypes } from '../ui/Badge'
import { useIsMobile } from '../../hooks/useIsMobile'
import type { Workout } from '../../types'

interface CalendarDayProps {
  day: number | null
  workouts: Workout[]
  isToday: boolean
  onClick?: () => void
}

const MOBILE_MAX_DOTS = 2
const DESKTOP_MAX_VISIBLE = 3

export function CalendarDay({ day, workouts, isToday, onClick }: CalendarDayProps) {
  const [hovered, setHovered] = useState(false)
  const isMobile = useIsMobile()

  if (day === null) return <div style={{ borderRadius: 8, ...(isMobile ? { minHeight: 64 } : { aspectRatio: '1' }) }} />

  const hasWorkouts = workouts.length > 0
  const firstWt = hasWorkouts ? workoutTypes[workouts[0].type] : null

  // ── MOBILE layout ────────────────────────────────────────────────────────────
  if (isMobile) {
    const visibleDots = workouts.slice(0, MOBILE_MAX_DOTS)
    const overflow = workouts.length - MOBILE_MAX_DOTS
    const totalTSS = workouts.filter(w => !w.planned).reduce((s, w) => s + (w.tss || 0), 0)

    return (
      <div
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          minHeight: 64,
          borderRadius: 8,
          border: isToday
            ? `2px solid ${COLORS.accent}`
            : `1px solid ${COLORS.border}`,
          background: isToday
            ? COLORS.accentDim
            : !hasWorkouts && hovered ? COLORS.subtle : COLORS.surface,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          padding: '5px 5px 4px',
          boxSizing: 'border-box',
          overflow: 'hidden',
          transition: 'background 0.15s',
        }}
      >
        {/* Day number */}
        <span style={{
          fontSize: 11,
          fontWeight: isToday ? 700 : 500,
          color: isToday ? COLORS.accent : COLORS.muted,
          lineHeight: 1,
          flexShrink: 0,
          marginBottom: hasWorkouts ? 4 : 0,
        }}>
          {day}
        </span>

        {!hasWorkouts && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: hovered ? COLORS.muted : COLORS.border,
            transition: 'color 0.15s',
          }}>
            +
          </div>
        )}

        {hasWorkouts && (
          <>
            {/* Workout dots */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
              {visibleDots.map(workout => {
                const wt = workoutTypes[workout.type]
                const isPlanned = workout.planned
                return (
                  <div key={workout.id} style={{ display: 'flex', alignItems: 'center', gap: 3, opacity: isPlanned ? 0.65 : 1 }}>
                    {/* Solid dot = completed, ring = planned */}
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: isPlanned ? 'transparent' : wt.color,
                      borderTop: isPlanned ? `1.5px solid ${wt.color}` : 'none',
                      borderRight: isPlanned ? `1.5px solid ${wt.color}` : 'none',
                      borderBottom: isPlanned ? `1.5px solid ${wt.color}` : 'none',
                      borderLeft: isPlanned ? `1.5px solid ${wt.color}` : 'none',
                    }} />
                    <span style={{ fontSize: 10, lineHeight: 1 }}>{wt.icon}</span>
                  </div>
                )
              })}
              {overflow > 0 && (
                <div style={{ fontSize: 8, color: COLORS.muted, lineHeight: 1, fontWeight: 600 }}>
                  +{overflow}
                </div>
              )}
            </div>

            {/* Completed TSS only */}
            {totalTSS > 0 && (
              <div style={{
                fontSize: 9, color: COLORS.muted,
                fontFamily: 'DM Mono, monospace',
                lineHeight: 1, marginTop: 2,
              }}>
                {totalTSS}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ── DESKTOP layout ───────────────────────────────────────────────────────────
  const visible = workouts.slice(0, DESKTOP_MAX_VISIBLE)
  const overflow = workouts.length - DESKTOP_MAX_VISIBLE

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        aspectRatio: '1',
        borderRadius: 8,
        border: isToday
          ? `2px solid ${COLORS.accent}`
          : hasWorkouts && hovered
            ? `1px solid ${firstWt!.color + '50'}`
            : `1px solid ${COLORS.border}`,
        background: !hasWorkouts && hovered
          ? COLORS.subtle
          : hasWorkouts && hovered
            ? firstWt!.color + '0d'
            : isToday ? COLORS.accentDim : COLORS.surface,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        padding: '6px 7px',
        transition: 'all 0.15s ease',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <span style={{
        fontSize: 11,
        fontWeight: isToday ? 700 : 500,
        color: isToday ? COLORS.accent : COLORS.muted,
        lineHeight: 1,
        flexShrink: 0,
      }}>
        {day}
      </span>

      {!hasWorkouts && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, color: hovered ? COLORS.muted : COLORS.border,
          fontWeight: 300, transition: 'color 0.15s',
        }}>
          +
        </div>
      )}

      {hasWorkouts && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-evenly',
          minHeight: 0,
          paddingTop: 2,
        }}>
          {visible.map(workout => {
            const wt = workoutTypes[workout.type]
            const isPlanned = workout.planned
            return (
              <div key={workout.id} style={{ opacity: isPlanned ? 0.72 : 1 }}>
                {/* Top indicator: solid bar for completed, dashed for planned */}
                {isPlanned ? (
                  <div style={{
                    height: 0, marginBottom: 3,
                    borderTop: `1px dashed ${wt.color}bb`,
                    borderRight: 'none', borderBottom: 'none', borderLeft: 'none',
                  }} />
                ) : (
                  <div style={{ height: 2, borderRadius: 1, background: wt.color, opacity: 0.85, marginBottom: 2 }} />
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: wt.color,
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                    lineHeight: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {wt.icon} {wt.label}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, marginLeft: 2 }}>
                    {isPlanned && (
                      <span style={{ fontSize: 7, color: COLORS.muted, fontWeight: 700, letterSpacing: '0.04em' }}>PLN</span>
                    )}
                    {workout.tss > 0 && (
                      <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: 'monospace', lineHeight: 1 }}>
                        {workout.tss}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {overflow > 0 && (
            <div style={{ fontSize: 9, fontWeight: 700, color: COLORS.accent, lineHeight: 1 }}>
              +{overflow} more
            </div>
          )}
        </div>
      )}
    </div>
  )
}
