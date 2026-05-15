import { COLORS } from '../../lib/colors'
import type { WorkoutType } from '../../types'

export const workoutTypes: Record<WorkoutType, { color: string; bg: string; border: string; label: string; icon: string }> = {
  run:      { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', label: 'Run',      icon: '🏃' },
  ride:     { color: '#6d28d9', bg: '#faf5ff', border: '#ddd6fe', label: 'Ride',     icon: '🚴' },
  swim:     { color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd', label: 'Swim',     icon: '🏊' },
  strength: { color: '#b45309', bg: '#fffbeb', border: '#fde68a', label: 'Strength', icon: '💪' },
  rest:     { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', label: 'Rest',     icon: '😴' },
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
