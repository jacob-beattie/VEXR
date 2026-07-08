import { describe, it, expect } from 'vitest'
import {
  resolveDate,
  resolveSessionDates,
  flagConflicts,
  computeTotalWeeks,
  computePlanPhases,
} from '../../../supabase/functions/_shared/planScheduling'

// This is the real code imported directly (like cors.test.ts), not a
// duplicated copy — a regression here would actually fail these tests,
// unlike the ai-briefing/strava-sync pattern where the test file re-implements
// the formula. This is the highest-value logic to cover per the testing
// review: a wrong date lands an entire AI-generated plan on the wrong days,
// and a missed conflict silently double-books a user's calendar.

describe('resolveDate', () => {
  it('resolves week 1 to the exact start date when day-of-week matches', () => {
    // 2024-01-01 is a Monday
    expect(resolveDate('2024-01-01', 1, 'Monday')).toBe('2024-01-01')
  })

  it('resolves later days within week 1 correctly', () => {
    expect(resolveDate('2024-01-01', 1, 'Wednesday')).toBe('2024-01-03')
    expect(resolveDate('2024-01-01', 1, 'Sunday')).toBe('2024-01-07')
  })

  it('advances by 7 days per additional week', () => {
    expect(resolveDate('2024-01-01', 2, 'Monday')).toBe('2024-01-08')
    expect(resolveDate('2024-01-01', 3, 'Monday')).toBe('2024-01-15')
  })

  it('combines week offset and day offset correctly', () => {
    expect(resolveDate('2024-01-01', 2, 'Wednesday')).toBe('2024-01-10')
  })

  it('rolls over a month boundary correctly', () => {
    expect(resolveDate('2024-01-29', 1, 'Wednesday')).toBe('2024-01-31')
    expect(resolveDate('2024-01-29', 1, 'Thursday')).toBe('2024-02-01')
  })

  it('is stable across a DST transition (UTC-anchored, no local-timezone drift)', () => {
    // US DST starts 2024-03-10 — a date computed via local-time arithmetic
    // could drift by an hour and round to the wrong calendar day.
    expect(resolveDate('2024-03-04', 2, 'Monday')).toBe('2024-03-11')
  })

  it('defaults to day offset 0 for an unrecognised day-of-week string', () => {
    expect(resolveDate('2024-01-01', 1, 'not-a-day')).toBe('2024-01-01')
  })
})

describe('resolveSessionDates', () => {
  it('attaches scheduled_date and has_conflict: false to every session', () => {
    const sessions = [
      { week: 1, day_of_week: 'Monday', title: 'Easy run' },
      { week: 2, day_of_week: 'Friday', title: 'Long ride' },
    ]
    const result = resolveSessionDates(sessions, '2024-01-01')

    expect(result).toEqual([
      { week: 1, day_of_week: 'Monday', title: 'Easy run', scheduled_date: '2024-01-01', has_conflict: false },
      { week: 2, day_of_week: 'Friday', title: 'Long ride', scheduled_date: '2024-01-12', has_conflict: false },
    ])
  })

  it('sets scheduled_date to null when startDate is not provided', () => {
    const sessions = [{ week: 1, day_of_week: 'Monday', title: 'Easy run' }]
    const result = resolveSessionDates(sessions, undefined)
    expect(result[0].scheduled_date).toBeNull()
  })

  it('sets scheduled_date to null when a session has no day_of_week', () => {
    const sessions = [{ week: 1, day_of_week: '', title: 'Rest' }]
    const result = resolveSessionDates(sessions, '2024-01-01')
    expect(result[0].scheduled_date).toBeNull()
  })

  it('does not mutate the input sessions', () => {
    const sessions = [{ week: 1, day_of_week: 'Monday', title: 'Easy run' }]
    resolveSessionDates(sessions, '2024-01-01')
    expect(sessions[0]).not.toHaveProperty('scheduled_date')
  })
})

describe('flagConflicts', () => {
  it('flags sessions whose scheduled_date matches an existing workout', () => {
    const sessions = [
      { scheduled_date: '2024-01-01', has_conflict: false },
      { scheduled_date: '2024-01-02', has_conflict: false },
    ]
    const result = flagConflicts(sessions, ['2024-01-01'])

    expect(result[0].has_conflict).toBe(true)
    expect(result[1].has_conflict).toBe(false)
  })

  it('does not flag a session with a null scheduled_date', () => {
    const sessions = [{ scheduled_date: null, has_conflict: false }]
    const result = flagConflicts(sessions, ['2024-01-01'])
    expect(result[0].has_conflict).toBe(false)
  })

  it('does not false-flag when no dates collide', () => {
    const sessions = [{ scheduled_date: '2024-01-05', has_conflict: false }]
    const result = flagConflicts(sessions, ['2024-01-01', '2024-01-02'])
    expect(result[0].has_conflict).toBe(false)
  })

  it('flags every session on a colliding date, not just the first', () => {
    // A double-session day (e.g. triathlon AM+PM) sharing one date must both
    // be flagged — missing one would silently let half a conflicting day
    // through the review screen unflagged.
    const sessions = [
      { scheduled_date: '2024-01-01', has_conflict: false, time_of_day: 'AM' },
      { scheduled_date: '2024-01-01', has_conflict: false, time_of_day: 'PM' },
    ]
    const result = flagConflicts(sessions, ['2024-01-01'])
    expect(result.every(s => s.has_conflict)).toBe(true)
  })

  it('returns has_conflict: false unchanged rather than dropping other fields', () => {
    const sessions = [{ scheduled_date: '2024-01-01', has_conflict: false, title: 'Threshold run' }]
    const result = flagConflicts(sessions, ['2024-01-01'])
    expect(result[0]).toEqual({ scheduled_date: '2024-01-01', has_conflict: true, title: 'Threshold run' })
  })
})

describe('computeTotalWeeks', () => {
  it('computes whole weeks between start and race date', () => {
    expect(computeTotalWeeks('2024-01-01', '2024-04-08')).toBe(14)
  })

  it('rounds to the nearest week rather than always flooring', () => {
    // 87 days (12 weeks + 3 days) rounds down to 12; 88 days (12 weeks + 4
    // days) rounds up to 13 — this is the exact boundary of Math.round.
    expect(computeTotalWeeks('2024-01-01', '2024-03-28')).toBe(12) // +87 days
    expect(computeTotalWeeks('2024-01-01', '2024-03-29')).toBe(13) // +88 days
  })

  it('clamps to a minimum of 1 week even if race date is before start date', () => {
    expect(computeTotalWeeks('2024-06-01', '2024-01-01')).toBe(1)
  })
})

describe('computePlanPhases', () => {
  it('splits a 20-week plan into base/build/taper using the documented 55/30/15 ratios', () => {
    const { baseWeeks, buildWeeks, peakEnd } = computePlanPhases(20)
    expect(baseWeeks).toBe(11) // round(20 * 0.55) = 11
    expect(buildWeeks).toBe(6) // round(20 * 0.3) = 6
    expect(peakEnd).toBe(17)
    expect(20 - peakEnd).toBe(3) // taper weeks
  })

  it('never lets peakEnd exceed totalWeeks for a very short plan', () => {
    const { peakEnd } = computePlanPhases(2)
    expect(peakEnd).toBeLessThanOrEqual(2)
  })
})
