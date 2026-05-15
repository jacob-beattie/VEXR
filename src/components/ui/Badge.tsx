import type { WorkoutType } from '../../types'
import { SPORT_COLORS } from '../../lib/colors'

export const workoutTypes: Record<WorkoutType, { color: string; bg: string; border: string; label: string; icon: string }> = {
  run:      { color: SPORT_COLORS.run,      bg: '#f0fdf4', border: '#bbf7d0', label: 'Run',      icon: '🏃' },
  ride:     { color: SPORT_COLORS.ride,     bg: '#faf5ff', border: '#ddd6fe', label: 'Ride',     icon: '🚴' },
  swim:     { color: SPORT_COLORS.swim,     bg: '#f0f9ff', border: '#bae6fd', label: 'Swim',     icon: '🏊' },
  strength: { color: SPORT_COLORS.strength, bg: '#fffbeb', border: '#fde68a', label: 'Strength', icon: '💪' },
  rest:     { color: SPORT_COLORS.rest,     bg: '#f9fafb', border: '#e5e7eb', label: 'Rest',     icon: '😴' },
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
      background: w.bg,
      border: `1px solid ${w.border}`,
      borderRadius: 4,
      padding: '2px 7px',
    }}>
      {w.label}
    </span>
  )
}
