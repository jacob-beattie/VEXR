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
})
