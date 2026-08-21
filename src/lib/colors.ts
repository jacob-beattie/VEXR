import type { WorkoutType, SessionSport } from '../types'

export const COLORS = {
  bg: "#f4f6f9",
  surface: "#ffffff",
  card: "#ffffff",
  border: "#e2e6ed",
  accent: "#0ea5e9",
  accentDim: "#0ea5e912",
  green: "#16a34a",
  orange: "#ea580c",
  purple: "#7c3aed",
  text: "#111827",
  muted: "#6b7280",
  subtle: "#f0f2f5",
  amber: "#d97706",
  strava: "#FC4C02",
  danger: "#ef4444",
  white: "#ffffff",
  black: "#000000",
  tipText: "#8b9eb0",
  restBlock: "#7b8fa6",
  heartRate: "#f87171",
  conflictAmber: "#f59e0b",
  accentDark: "#0284c7",
  accentBright: "#00c8e0",
}

export const SPORT_COLORS: Record<WorkoutType | SessionSport, string> = {
  swim:     COLORS.accent,
  ride:     COLORS.purple,
  bike:     COLORS.purple,
  run:      COLORS.green,
  strength: COLORS.amber,
  sc:       COLORS.amber,
  brick:    COLORS.orange,
  rest:     COLORS.muted,
  other:    COLORS.muted,
}

// Light pastel bg/border tints per workout type, used by Badge chips and the calendar's
// PLANNED badge/hover-border treatment. Kept separate from SPORT_COLORS (which is the
// solid/text color for each sport) since these are tint pairs, not single values.
export const WORKOUT_TYPE_TINTS: Record<WorkoutType, { bg: string; border: string; shadowColor: string; darkBorder: string }> = {
  run:      { bg: '#f0fdf4', border: '#bbf7d0', shadowColor: '#16a34a1a', darkBorder: '#86efac' },
  ride:     { bg: '#faf5ff', border: '#ddd6fe', shadowColor: '#7c3aed1a', darkBorder: '#c4b5fd' },
  swim:     { bg: '#f0f9ff', border: '#bae6fd', shadowColor: '#0ea5e91a', darkBorder: '#7dd3fc' },
  strength: { bg: '#fffbeb', border: '#fde68a', shadowColor: '#d977061a', darkBorder: '#fcd34d' },
  rest:     { bg: '#f9fafb', border: '#e5e7eb', shadowColor: '#6b72801a', darkBorder: '#d1d5db' },
}
