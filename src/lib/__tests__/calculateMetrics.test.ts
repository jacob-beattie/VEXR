import { describe, it, expect } from 'vitest'
import { buildTssByDay, calculatePMC } from '../calculateMetrics'
import type { Workout } from '../../types'

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: Math.random().toString(36).slice(2),
    user_id: 'user-1',
    title: 'Test workout',
    type: 'ride',
    date: '2024-01-01',
    duration_minutes: 60,
    tss: 100,
    zone: '',
    notes: '',
    planned: false,
    ...overrides,
  } as Workout
}

describe('buildTssByDay', () => {
  it('returns empty map for no workouts', () => {
    expect(buildTssByDay([])).toEqual({})
  })

  it('maps date to TSS', () => {
    const w = makeWorkout({ date: '2024-01-15', tss: 80 })
    expect(buildTssByDay([w])).toEqual({ '2024-01-15': 80 })
  })

  it('sums multiple workouts on the same day', () => {
    const a = makeWorkout({ date: '2024-01-15', tss: 60 })
    const b = makeWorkout({ date: '2024-01-15', tss: 40 })
    expect(buildTssByDay([a, b])).toEqual({ '2024-01-15': 100 })
  })

  it('keeps separate dates separate', () => {
    const a = makeWorkout({ date: '2024-01-15', tss: 80 })
    const b = makeWorkout({ date: '2024-01-16', tss: 50 })
    expect(buildTssByDay([a, b])).toEqual({
      '2024-01-15': 80,
      '2024-01-16': 50,
    })
  })

  it('excludes planned workouts', () => {
    const actual = makeWorkout({ date: '2024-01-15', tss: 80, planned: false })
    const planned = makeWorkout({ date: '2024-01-15', tss: 999, planned: true })
    expect(buildTssByDay([actual, planned])).toEqual({ '2024-01-15': 80 })
  })

  it('strips time component from date strings', () => {
    const w = makeWorkout({ date: '2024-01-15T08:00:00', tss: 75 })
    expect(buildTssByDay([w])).toEqual({ '2024-01-15': 75 })
  })

  it('treats null/undefined TSS as 0', () => {
    const w = makeWorkout({ date: '2024-01-15', tss: null as unknown as number })
    expect(buildTssByDay([w])).toEqual({ '2024-01-15': 0 })
  })
})

describe('calculatePMC', () => {
  it('returns zeros for no workouts', () => {
    const today = new Date('2024-03-01T00:00:00')
    const windowStart = new Date('2024-02-01T00:00:00')
    const result = calculatePMC([], windowStart, today)
    expect(result.current).toEqual({ ctl: 0, atl: 0, tsb: 0 })
    expect(result.history).toEqual([])
  })

  it('TSB always equals CTL minus ATL', () => {
    const workouts = [
      makeWorkout({ date: '2024-01-01', tss: 100 }),
      makeWorkout({ date: '2024-01-08', tss: 80 }),
      makeWorkout({ date: '2024-01-15', tss: 120 }),
    ]
    const today = new Date('2024-02-01T00:00:00')
    const windowStart = new Date('2024-01-01T00:00:00')
    const { current, history } = calculatePMC(workouts, windowStart, today)

    expect(current.tsb).toBe(current.ctl - current.atl)
    for (const day of history) {
      expect(day.tsb).toBeCloseTo(day.ctl - day.atl, 0)
    }
  })

  it('ATL reacts faster than CTL to a high-TSS day', () => {
    // Single very hard workout; ATL (7-day) should spike higher than CTL (42-day)
    const workouts = [makeWorkout({ date: '2024-01-01', tss: 300 })]
    const today = new Date('2024-01-01T00:00:00')
    const windowStart = new Date('2024-01-01T00:00:00')
    const { current } = calculatePMC(workouts, windowStart, today)

    expect(current.atl).toBeGreaterThan(current.ctl)
  })

  it('excludes planned workouts from PMC', () => {
    const actual = makeWorkout({ date: '2024-01-01', tss: 100, planned: false })
    const planned = makeWorkout({ date: '2024-01-01', tss: 9999, planned: true })
    const today = new Date('2024-01-15T00:00:00')
    const windowStart = new Date('2024-01-01T00:00:00')

    const withPlanned = calculatePMC([actual, planned], windowStart, today)
    const withoutPlanned = calculatePMC([actual], windowStart, today)

    expect(withPlanned.current).toEqual(withoutPlanned.current)
  })

  it('history array spans from windowStart to today', () => {
    const workouts = [makeWorkout({ date: '2024-01-01', tss: 80 })]
    const today = new Date('2024-01-31T00:00:00')
    const windowStart = new Date('2024-01-01T00:00:00')
    const { history } = calculatePMC(workouts, windowStart, today)

    expect(history[0].date).toBe('2024-01-01')
    expect(history[history.length - 1].date).toBe('2024-01-31')
    expect(history.length).toBe(31)
  })

  it('CTL and ATL converge toward 0 after a long rest period', () => {
    const workouts = [makeWorkout({ date: '2023-01-01', tss: 200 })]
    // Check 6 months later — enough warmup time for values to decay
    const today = new Date('2023-07-01T00:00:00')
    const windowStart = new Date('2023-06-30T00:00:00')
    const { current } = calculatePMC(workouts, windowStart, today)

    expect(current.ctl).toBeLessThan(1)
    expect(current.atl).toBe(0)
  })

  // Exact values below are computed independently from the documented EWMA
  // formula (CTL_K = 1 - e^(-1/42), ATL_K = 1 - e^(-1/7), applied day-by-day
  // from ctl=atl=0), not re-derived from the function under test — this is
  // the same style as a known-correct reference implementation, so it would
  // actually catch a broken formula (wrong time constant, swapped CTL/ATL,
  // off-by-one day iteration) rather than just a broken copy of the formula.
  it('single workout produces the exact hand-computed CTL/ATL/TSB on day one', () => {
    const workouts = [makeWorkout({ date: '2024-01-01', tss: 100 })]
    const today = new Date('2024-01-01T00:00:00')
    const windowStart = new Date('2024-01-01T00:00:00')
    const { current } = calculatePMC(workouts, windowStart, today)

    // ctl = 0 + (1 - e^(-1/42)) * 100 = 2.3528... -> rounds to 2
    // atl = 0 + (1 - e^(-1/7))  * 100 = 13.3122... -> rounds to 13
    // tsb = round(2.3528 - 13.3122) = round(-10.9594) = -11
    expect(current).toEqual({ ctl: 2, atl: 13, tsb: -11 })
  })

  it('a mid-history gap decays CTL/ATL to the exact hand-computed values at the next workout', () => {
    // Workout on day 0 (tss 100), 9 rest days, workout on day 10 (tss 50).
    // Verified independently by iterating the same day-by-day EWMA formula
    // outside calculatePMC (not by re-running calculatePMC itself).
    const workouts = [
      makeWorkout({ date: '2024-01-01', tss: 100 }),
      makeWorkout({ date: '2024-01-11', tss: 50 }),
    ]
    const today = new Date('2024-01-11T00:00:00')
    const windowStart = new Date('2024-01-01T00:00:00')
    const { current } = calculatePMC(workouts, windowStart, today)

    expect(current).toEqual({ ctl: 3, atl: 10, tsb: -7 })
  })

  it('current fitness values do not depend on how far back the history window starts', () => {
    // `windowStart` only trims the returned `history` array — CTL/ATL always
    // warm up from the true earliest workout regardless of what window the
    // caller asked to see. A regression that let windowStart affect warmup
    // would silently understate fitness for any "last 4 weeks" chart.
    const workouts = [
      makeWorkout({ date: '2023-11-01', tss: 90 }),
      makeWorkout({ date: '2023-12-01', tss: 110 }),
      makeWorkout({ date: '2024-01-01', tss: 100 }),
    ]
    const today = new Date('2024-01-15T00:00:00')

    const fullHistory = calculatePMC(workouts, new Date('2023-11-01T00:00:00'), today)
    const trimmedWindow = calculatePMC(workouts, new Date('2024-01-01T00:00:00'), today)

    expect(trimmedWindow.current).toEqual(fullHistory.current)
    expect(trimmedWindow.history.length).toBeLessThan(fullHistory.history.length)
  })

  it('clamps the history window to the first workout when windowStart is earlier than any data', () => {
    const workouts = [makeWorkout({ date: '2024-01-15', tss: 80 })]
    const today = new Date('2024-01-20T00:00:00')
    // Asking for history starting a full year before the first workout
    const windowStart = new Date('2023-01-01T00:00:00')
    const { history } = calculatePMC(workouts, windowStart, today)

    // No fabricated pre-data days — the array starts exactly at the first workout.
    expect(history[0].date).toBe('2024-01-15')
    expect(history.length).toBe(6)
  })
})
