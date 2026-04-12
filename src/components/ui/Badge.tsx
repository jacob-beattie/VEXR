import { COLORS } from '../../lib/colors'
import type { WorkoutType } from '../../types'

export const workoutTypes: Record<WorkoutType, { color: string; label: string; icon: string }> = {
  run: { color: COLORS.green, label: 'Run', icon: '🏃' },
  ride: { color: COLORS.accent, label: 'Ride', icon: '🚴' },
  swim: { color: COLORS.purple, label: 'Swim', icon: '🏊' },
  strength: { color: COLORS.orange, label: 'Strength', icon: '💪' },
  rest: { color: COLORS.muted, label: 'Rest', icon: '😴' },
}

interface BadgeProps {
  type: WorkoutType
}

export function Badge({ type }: BadgeProps) {
  const w = workoutTypes[type]
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: w.color,
      background: w.color + '18',
      border: `1px solid ${w.color}30`,
      borderRadius: 4,
      padding: '2px 7px',
    }}>
      {w.label}
    </span>
  )
}
