import type { Workout } from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const CTL_K = 1 - Math.exp(-1 / 42)  // 42-day time constant (Fitness)
const ATL_K = 1 - Math.exp(-1 / 7)   // 7-day time constant  (Fatigue)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DayMetrics {
  date: string   // YYYY-MM-DD
  label: string  // "1 Apr"
  tss: number    // actual daily TSS (0 for rest days)
  ctl: number    // Fitness
  atl: number    // Fatigue
  tsb: number    // Form = CTL - ATL
}

export interface FitnessSnapshot {
  ctl: number
  atl: number
  tsb: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Build a YYYY-MM-DD → TSS map from actual (non-planned) workouts only.
 * Multiple workouts on the same day are summed.
 */
export function buildTssByDay(workouts: Workout[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const w of workouts) {
    if (w.planned) continue  // planned workouts don't count as actual load
    const key = w.date.split('T')[0]
    map[key] = (map[key] || 0) + (w.tss || 0)
  }
  return map
}

/**
 * Core PMC engine. Iterates day by day from warmupStart → today applying:
 *   CTL = CTL + (TSS - CTL) * CTL_K
 *   ATL = ATL + (TSS - ATL) * ATL_K
 *
 * Collects a DayMetrics entry for every day in [windowStart, today].
 * Days before windowStart are still computed (warmup) so CTL is accurate.
 */
function runPMC(
  tssByDay: Record<string, number>,
  warmupStart: Date,
  windowStart: Date,
  today: Date,
): { current: FitnessSnapshot; history: DayMetrics[] } {
  let ctl = 0
  let atl = 0
  const history: DayMetrics[] = []

  // Use ms arithmetic to avoid setDate mutation bugs
  const totalDays = Math.round((today.getTime() - warmupStart.getTime()) / 86400000)

  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(warmupStart.getTime() + i * 86400000)
    const key = localDateKey(d)
    const tss = tssByDay[key] || 0

    ctl = ctl + CTL_K * (tss - ctl)
    atl = atl + ATL_K * (tss - atl)

    if (d.getTime() >= windowStart.getTime()) {
      history.push({
        date: key,
        label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        tss,
        ctl: Math.round(ctl * 10) / 10,
        atl: Math.round(atl * 10) / 10,
        tsb: Math.round((ctl - atl) * 10) / 10,
      })
    }
  }

  return {
    current: {
      ctl: Math.round(ctl),
      atl: Math.round(atl),
      tsb: Math.round(ctl - atl),
    },
    history,
  }
}

/**
 * Main entry point.
 *
 * - Excludes planned workouts from TSS
 * - Warms up from the earliest actual workout date so CTL is never underestimated
 * - Returns `current` (today's CTL/ATL/TSB) and `history` (daily array for the window)
 *
 * @param workouts  All workouts from the database
 * @param windowStart  First date to include in the returned history array
 * @param today  End date (inclusive) — pass midnight-normalised Date for today
 */
export function calculatePMC(
  workouts: Workout[],
  windowStart: Date,
  today: Date,
): { current: FitnessSnapshot; history: DayMetrics[] } {
  const tssByDay = buildTssByDay(workouts)
  const allDates = Object.keys(tssByDay).sort()

  if (allDates.length === 0) {
    return { current: { ctl: 0, atl: 0, tsb: 0 }, history: [] }
  }

  const warmupStart = new Date(allDates[0] + 'T00:00:00')

  // Window can't start before the first workout — clamp it
  const effectiveWindow = windowStart < warmupStart ? warmupStart : windowStart

  const result = runPMC(tssByDay, warmupStart, effectiveWindow, today)

  return result
}
