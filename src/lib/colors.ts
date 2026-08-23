import type { WorkoutType, SessionSport, BlockType } from '../types'

export const COLORS = {
  bg: "#f5f7f8",
  surface: "#ffffff",
  card: "#ffffff",
  border: "#dde1e4",
  accent: "#0c8a3f",
  accentDim: "#0c8a3f12",
  green: "#0c8a3f",
  orange: "#a8422a",
  purple: "#9330a8",
  text: "#14171a",
  muted: "#5b6169",
  subtle: "#eef1f2",
  amber: "#c98a12",
  strava: "#FC4C02",
  danger: "#c62828",
  white: "#ffffff",
  black: "#000000",
  tipText: "#8b9198",
  restBlock: "#5b6169",
  heartRate: "#c23b2e",
  conflictAmber: "#a8690a",
  accentDark: "#086b30",
  accentBright: "#12a34a",
}

// Canonical CTL/ATL/TSB colors — the PMC (fitness/fatigue/form) triad shown together
// on FitnessAreaChart and referenced anywhere else the same three metrics appear
// (e.g. the Landing page's dashboard preview), so the palette never drifts between them.
// Validated colorblind-safe as an all-pairs set (lines can cross and sit adjacent anywhere).
export const PMC_COLORS = {
  ctl: "#0a6fd1",
  atl: "#c98a12",
  tsb: "#0a9a94",
}

// HR training zones as an ordinal ramp (one hue, light->dark) rather than 5 unrelated
// categorical colors — zone order carries real meaning (recovery -> max effort), so this
// is validated for monotone lightness/contrast, not adjacent-pair colorblind separation.
// Zone 1 -> Zone 5. Shared by analyticsDerivations.ts (HR_ZONE_COLORS) and
// AnalyticsPage.tsx (ZONE_COLORS) so the ramp never drifts between the two.
export const HR_ZONE_RAMP = ["#e0947a", "#d1604a", "#b8362a", "#8f2318", "#5c130c"]

// Macro-nutrient identity colors — distinct from PMC/sport data colors that happen to
// share the same underlying hues (CTL blue / ATL amber / bike violet), validated
// colorblind-safe together (all-pairs, since the ring/bars/split legend show all three
// at once). Deliberately not `green` — that's reserved for status/interactive use.
// Shared by NutritionSummaryCard.tsx and Nutrition.tsx so the mapping never drifts.
export const MACRO_COLORS = { protein: PMC_COLORS.ctl, carbs: PMC_COLORS.atl, fat: "#9330a8" }

// Structured-workout block-type colors, shared by LogWorkoutModal (block builder) and
// WorkoutDetailModal (block breakdown view) so warmup/interval/cooldown read the same
// in both places instead of each component keeping its own drifting copy. Validated
// colorblind-safe together (all-pairs — blocks can sit adjacent in any order when
// drag-reordered). `rest` stays a plain neutral, not part of the identity set.
export const BLOCK_COLORS: Record<BlockType, string> = {
  warmup: "#c98a12",
  interval: "#9330a8",
  rest: "#5b6169",
  cooldown: "#0c8a3f",
}

export const SPORT_COLORS: Record<WorkoutType | SessionSport, string> = {
  swim:     "#0a6fd1",
  ride:     "#9330a8",
  bike:     "#9330a8",
  run:      "#0a9a94",
  strength: "#c98a12",
  sc:       "#c98a12",
  brick:    "#a8422a",
  rest:     COLORS.muted,
  other:    COLORS.muted,
}

// Light pastel bg/border tints per workout type, used by Badge chips and the calendar's
// PLANNED badge/hover-border treatment. Kept separate from SPORT_COLORS (which is the
// solid/text color for each sport) since these are tint pairs, not single values.
export const WORKOUT_TYPE_TINTS: Record<WorkoutType, { bg: string; border: string; shadowColor: string; darkBorder: string }> = {
  run:      { bg: '#e6f5f4', border: '#a8d9d5', shadowColor: '#0a9a941a', darkBorder: '#5cb8b2' },
  ride:     { bg: '#f5e9f7', border: '#dcb3e3', shadowColor: '#9330a81a', darkBorder: '#c17bcb' },
  swim:     { bg: '#e6f0fb', border: '#a8cbf0', shadowColor: '#0a6fd11a', darkBorder: '#6ba3e0' },
  strength: { bg: '#faf0dc', border: '#e8c477', shadowColor: '#c98a121a', darkBorder: '#dba83f' },
  rest:     { bg: '#eef0f1', border: '#c9cdd1', shadowColor: '#5b61691a', darkBorder: '#9298a0' },
}
