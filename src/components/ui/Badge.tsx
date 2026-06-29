import type { WorkoutType } from '../../types'
import { SPORT_COLORS } from '../../lib/colors'

export const workoutTypes: Record<WorkoutType, { color: string; bg: string; border: string; label: string; icon: string; shadowColor: string; darkBorder: string }> = {
  run:      { color: SPORT_COLORS.run,      bg: '#f0fdf4', border: '#bbf7d0', label: 'Run',      icon: '🏃', shadowColor: '#16a34a1a', darkBorder: '#86efac' },
  ride:     { color: SPORT_COLORS.ride,     bg: '#faf5ff', border: '#ddd6fe', label: 'Ride',     icon: '🚴', shadowColor: '#7c3aed1a', darkBorder: '#c4b5fd' },
  swim:     { color: SPORT_COLORS.swim,     bg: '#f0f9ff', border: '#bae6fd', label: 'Swim',     icon: '🏊', shadowColor: '#0ea5e91a', darkBorder: '#7dd3fc' },
  strength: { color: SPORT_COLORS.strength, bg: '#fffbeb', border: '#fde68a', label: 'Strength', icon: '💪', shadowColor: '#d977061a', darkBorder: '#fcd34d' },
  rest:     { color: SPORT_COLORS.rest,     bg: '#f9fafb', border: '#e5e7eb', label: 'Rest',     icon: '😴', shadowColor: '#6b72801a', darkBorder: '#d1d5db' },
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
