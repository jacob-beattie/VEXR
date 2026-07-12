// Pure reporting/analytics selectors over a `workouts` array — extracted out of
// WorkoutsContext so they're unit-testable without mounting the provider (mirrors the
// calculateMetrics.ts pattern: same inputs always produce the same output, no React/Supabase
// dependency). WorkoutsContext still owns memoization/caching and calls these directly.
import type { Workout } from '../types'
import { calculatePMC } from './calculateMetrics'
import { getWeekStart, getWeekEnd } from './dateUtils'

export interface FitnessMetrics {
  ctl: number
  atl: number
  tsb: number
}

export type WeeklyLoadEntry = { week: string; tss: number; planned: number }
export type DailyLoadEntry = { day: string; tss: number; planned: number }
export type FitnessHistoryEntry = { week: string; fitness: number; fatigue: number; form: number }

function formatDateLabel(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Current CTL/ATL/TSB as of `today` (00:00:00 recommended so results are stable across a render). */
export function calculateFitnessMetrics(workouts: Workout[], today: Date): FitnessMetrics {
  const { current } = calculatePMC(workouts, today, today)
  return current
}

/** Actual vs. planned TSS for each of the 7 days (Mon–Sun) of the week containing `now`. */
export function getDailyWeekLoad(workouts: Workout[], now: Date): DailyLoadEntry[] {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const monday = getWeekStart(now)
  return days.map((d, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    date.setHours(0, 0, 0, 0)
    const dateEnd = new Date(date)
    dateEnd.setHours(23, 59, 59, 999)
    const dayWorkouts = workouts.filter(w => {
      const wd = new Date(w.date + 'T00:00:00')
      return wd >= date && wd <= dateEnd
    })
    return {
      day: d,
      tss: dayWorkouts.filter(w => !w.planned).reduce((s, w) => s + (w.tss || 0), 0),
      planned: dayWorkouts.filter(w => w.planned).reduce((s, w) => s + (w.tss || 0), 0),
    }
  })
}

/** Actual vs. planned TSS for each of the trailing `weeks` weeks up to and including the week containing `now`. */
export function getWeeklyLoadHistory(workouts: Workout[], now: Date, weeks = 8): WeeklyLoadEntry[] {
  const currentWeekStart = getWeekStart(now)
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(currentWeekStart)
    weekStart.setDate(currentWeekStart.getDate() - (weeks - 1 - i) * 7)
    const weekEnd = getWeekEnd(weekStart)
    const ww = workouts.filter(w => {
      const d = new Date(w.date + 'T00:00:00')
      return d >= weekStart && d <= weekEnd
    })
    return {
      week: formatDateLabel(weekStart),
      tss: ww.filter(w => !w.planned).reduce((s, w) => s + (w.tss || 0), 0),
      planned: ww.filter(w => w.planned).reduce((s, w) => s + (w.tss || 0), 0),
    }
  })
}

/** Weekly CTL/ATL/TSB history for the trailing `weeks` weeks ending on `today`. */
export function getFitnessHistory(workouts: Workout[], today: Date, weeks = 8): FitnessHistoryEntry[] {
  const windowStart = new Date(today.getTime() - weeks * 7 * 86400000)
  const { history } = calculatePMC(workouts, windowStart, today)
  return history.map(d => ({
    week: d.label,
    fitness: d.ctl,
    fatigue: d.atl,
    form: d.tsb,
  }))
}
