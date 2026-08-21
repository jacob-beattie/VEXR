// Deno-global-free pure functions for resolving training plan sessions onto
// real calendar dates and flagging conflicts with existing workouts. Shared by
// parse-plan and generate-plan so there is exactly one implementation to
// test and reason about — a wrong day offset or a missed conflict check
// silently miscalendars or double-books a user's training plan, so this
// logic is imported directly by Vitest tests rather than duplicated.

export const DAY_OFFSETS: Record<string, number> = {
  Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3,
  Friday: 4, Saturday: 5, Sunday: 6,
}

/** Resolves a plan's week number + day-of-week into an actual YYYY-MM-DD calendar date. */
export function resolveDate(startDate: string, week: number, dayOfWeek: string): string {
  const start = new Date(startDate + 'T00:00:00Z')
  const weekOffset = (week - 1) * 7
  const dayOffset = DAY_OFFSETS[dayOfWeek] ?? 0
  const resolved = new Date(start.getTime() + (weekOffset + dayOffset) * 86400000)
  return resolved.toISOString().split('T')[0]
}

interface SchedulableSession {
  week: number
  day_of_week: string
}

/** Adds `scheduled_date` (null if unresolvable) and `has_conflict: false` to each parsed session. */
export function resolveSessionDates<T extends SchedulableSession>(
  sessions: T[],
  startDate: string | undefined,
): (T & { scheduled_date: string | null; has_conflict: boolean })[] {
  return sessions.map(s => ({
    ...s,
    scheduled_date: startDate && s.day_of_week ? resolveDate(startDate, s.week, s.day_of_week) : null,
    has_conflict: false,
  }))
}

interface ScheduledSession {
  scheduled_date: string | null
  has_conflict: boolean
}

/** Flags sessions whose scheduled_date collides with an existing workout date. */
export function flagConflicts<T extends ScheduledSession>(sessions: T[], existingWorkoutDates: string[]): T[] {
  const conflictSet = new Set(existingWorkoutDates)
  return sessions.map(s =>
    s.scheduled_date && conflictSet.has(s.scheduled_date) ? { ...s, has_conflict: true } : s
  )
}

/** Whole weeks between start and race date (rounded, minimum 1). */
export function computeTotalWeeks(startDate: string, raceDate: string): number {
  const startMs = Date.parse(startDate)
  const raceMs = Date.parse(raceDate)
  return Math.max(1, Math.round((raceMs - startMs) / (7 * 86400000)))
}

export interface PlanPhases {
  baseWeeks: number
  buildWeeks: number
  peakEnd: number
}

/** Splits a plan's total weeks into base (55%) / build (30%) / taper (remaining ~15%) phases. */
export function computePlanPhases(totalWeeks: number): PlanPhases {
  const baseWeeks = Math.round(totalWeeks * 0.55)
  const buildWeeks = Math.round(totalWeeks * 0.3)
  return { baseWeeks, buildWeeks, peakEnd: baseWeeks + buildWeeks }
}
