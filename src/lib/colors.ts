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
}

export const SPORT_COLORS: Record<string, string> = {
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
