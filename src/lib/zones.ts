// Heart-rate zone threshold math (Z1 <65%, Z2 65-75%, Z3 75-82%, Z4 82-89%, Z5 89-100% of max HR).
// Canonical home for this math — Profile Settings (training_zones) and Analytics (HR zone
// donut/chart) both derive their zone boundaries from the same max HR, so they must stay in sync.

export interface HRZoneBoundary {
  min: number
  max: number | null
}

export function calcHRZoneBoundaries(maxHr: number): HRZoneBoundary[] {
  const z1Max = Math.round(maxHr * 0.65)
  const z2Max = Math.round(maxHr * 0.75)
  const z3Max = Math.round(maxHr * 0.82)
  const z4Max = Math.round(maxHr * 0.89)
  return [
    { min: 0,         max: z1Max },
    { min: z1Max + 1, max: z2Max },
    { min: z2Max + 1, max: z3Max },
    { min: z3Max + 1, max: z4Max },
    { min: z4Max + 1, max: null },
  ]
}
