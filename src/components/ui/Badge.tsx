import type { WorkoutType } from '../../types'
import { SPORT_COLORS, WORKOUT_TYPE_TINTS } from '../../lib/colors'
import { RADIUS } from '../../lib/designTokens'

const LABELS: Record<WorkoutType, string> = {
  run: 'Run', ride: 'Ride', swim: 'Swim', strength: 'Strength', rest: 'Rest',
}
const ICONS: Record<WorkoutType, string> = {
  run: '🏃', ride: '🚴', swim: '🏊', strength: '💪', rest: '😴',
}

// workoutTypes is consumed by ~12 components across calendar/dashboard/library.
// Splitting it into its own file would touch every one of those importers for
// a fast-refresh nicety only — not worth it on a solo project. Scoped disable
// instead of a file-structure change.
// eslint-disable-next-line react-refresh/only-export-components
export const workoutTypes: Record<WorkoutType, { color: string; bg: string; border: string; label: string; icon: string; shadowColor: string; darkBorder: string }> =
  Object.fromEntries((Object.keys(LABELS) as WorkoutType[]).map(type => [type, {
    color: SPORT_COLORS[type],
    label: LABELS[type],
    icon: ICONS[type],
    ...WORKOUT_TYPE_TINTS[type],
  }])) as Record<WorkoutType, { color: string; bg: string; border: string; label: string; icon: string; shadowColor: string; darkBorder: string }>

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
      borderRadius: RADIUS.chip,
      padding: '2px 7px',
    }}>
      {w.label}
    </span>
  )
}
