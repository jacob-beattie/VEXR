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
    const totalTSS = workouts.reduce((s, w) => s + (w.tss || 0), 0)

    return (
      <div
        onClick={hasWorkouts ? onClick : undefined}
        style={{
          minHeight: 64,
          borderRadius: 8,
          border: isToday
            ? `2px solid ${COLORS.accent}`
            : `1px solid ${COLORS.border}`,
          background: isToday ? COLORS.accentDim : COLORS.surface,
          cursor: hasWorkouts ? 'pointer' : 'default',
          display: 'flex',
          flexDirection: 'column',
          padding: '5px 5px 4px',
          boxSizing: 'border-box',
          overflow: 'hidden',
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

        {hasWorkouts && (
          <>
            {/* Workout dots */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
              {visibleDots.map(workout => {
                const wt = workoutTypes[workout.type]
                return (
                  <div key={workout.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: wt.color,
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

            {/* Total TSS */}
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

  // ── DESKTOP layout (unchanged) ───────────────────────────────────────────────
  const visible = workouts.slice(0, DESKTOP_MAX_VISIBLE)
  const overflow = workouts.length - DESKTOP_MAX_VISIBLE

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={hasWorkouts ? onClick : undefined}
      style={{
        aspectRatio: '1',
        borderRadius: 8,
        border: isToday
          ? `2px solid ${COLORS.accent}`
          : `1px solid ${hovered && hasWorkouts ? firstWt!.color + '50' : COLORS.border}`,
        background: hovered && hasWorkouts
          ? firstWt!.color + '0d'
          : isToday ? COLORS.accentDim : COLORS.surface,
        cursor: hasWorkouts ? 'pointer' : 'default',
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
            return (
              <div key={workout.id}>
                <div style={{ height: 2, borderRadius: 1, background: wt.color, opacity: 0.85, marginBottom: 2 }} />
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
                  {workout.tss > 0 && (
                    <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: 'monospace', lineHeight: 1, flexShrink: 0, marginLeft: 2 }}>
                      {workout.tss}
                    </span>
                  )}
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
