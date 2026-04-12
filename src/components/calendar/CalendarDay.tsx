import { useState } from 'react'
import { COLORS } from '../../lib/colors'
import { workoutTypes } from '../ui/Badge'
import type { Workout } from '../../types'

interface CalendarDayProps {
  day: number | null
  workouts: Workout[]
  isToday: boolean
  onClick?: () => void
}

const MAX_VISIBLE = 3

export function CalendarDay({ day, workouts, isToday, onClick }: CalendarDayProps) {
  const [hovered, setHovered] = useState(false)
  if (day === null) return <div style={{ aspectRatio: '1', borderRadius: 8 }} />

  const hasWorkouts = workouts.length > 0
  const visible = workouts.slice(0, MAX_VISIBLE)
  const overflow = workouts.length - MAX_VISIBLE
  const firstWt = hasWorkouts ? workoutTypes[workouts[0].type] : null

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
      {/* Day number */}
      <span style={{
        fontSize: 11,
        fontWeight: isToday ? 700 : 500,
        color: isToday ? COLORS.accent : COLORS.muted,
        lineHeight: 1,
        flexShrink: 0,
      }}>
        {day}
      </span>

      {/* Workout rows — flex-grow fills remaining height, space-evenly distributes */}
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
