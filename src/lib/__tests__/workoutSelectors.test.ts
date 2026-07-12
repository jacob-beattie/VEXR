import { describe, it, expect } from 'vitest'
import { calculateFitnessMetrics, getDailyWeekLoad, getWeeklyLoadHistory, getFitnessHistory } from '../workoutSelectors'
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

// Monday 2024-01-01 through Sunday 2024-01-07
const MONDAY = new Date('2024-01-01T12:00:00')

describe('calculateFitnessMetrics', () => {
  it('returns zero fitness with no workouts', () => {
    const result = calculateFitnessMetrics([], MONDAY)
    expect(result).toEqual({ ctl: 0, atl: 0, tsb: 0 })
  })

  it('matches calculatePMC current output for a single workout', () => {
    // Must be midnight-normalised — calculatePMC counts whole days between warmupStart and
    // `today`, and a non-midnight `today` would shift the day count (see calculateMetrics.ts's
    // own doc comment: "pass midnight-normalised Date for today").
    const today = new Date('2024-01-01T00:00:00')
    const w = makeWorkout({ date: '2024-01-01', tss: 100 })
    const result = calculateFitnessMetrics([w], today)
    // day-one single workout: ctl = round(100 * (1 - e^-1/42)), atl = round(100 * (1 - e^-1/7))
    // calculatePMC's `current` snapshot rounds to whole numbers (see calculateMetrics.ts).
    expect(result.ctl).toBe(Math.round(100 * (1 - Math.exp(-1 / 42))))
    expect(result.atl).toBe(Math.round(100 * (1 - Math.exp(-1 / 7))))
  })
})

describe('getDailyWeekLoad', () => {
  it('returns 7 days labeled Mon–Sun', () => {
    const result = getDailyWeekLoad([], MONDAY)
    expect(result.map(d => d.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  })

  it('buckets a workout into the correct day regardless of which day of the week `now` is', () => {
    const wednesdayWorkout = makeWorkout({ date: '2024-01-03', tss: 50, planned: false })
    // Query from a Sunday in the same week — should still bucket into Wed
    const sunday = new Date('2024-01-07T09:00:00')
    const result = getDailyWeekLoad([wednesdayWorkout], sunday)
    expect(result[2].tss).toBe(50) // index 2 = Wed
    expect(result.filter(d => d.day !== 'Wed').every(d => d.tss === 0)).toBe(true)
  })

  it('separates actual (not planned) from planned TSS', () => {
    const actual = makeWorkout({ date: '2024-01-01', tss: 60, planned: false })
    const planned = makeWorkout({ date: '2024-01-01', tss: 40, planned: true })
    const result = getDailyWeekLoad([actual, planned], MONDAY)
    expect(result[0]).toEqual({ day: 'Mon', tss: 60, planned: 40 })
  })
})

describe('getWeeklyLoadHistory', () => {
  it('returns `weeks` entries', () => {
    const result = getWeeklyLoadHistory([], MONDAY, 4)
    expect(result).toHaveLength(4)
  })

  it('places the current week last', () => {
    const w = makeWorkout({ date: '2024-01-01', tss: 75, planned: false })
    const result = getWeeklyLoadHistory([w], MONDAY, 3)
    expect(result[2].tss).toBe(75)
    expect(result[0].tss).toBe(0)
    expect(result[1].tss).toBe(0)
  })

  it('is independent of what day within the week `now` falls on', () => {
    const w = makeWorkout({ date: '2024-01-01', tss: 75, planned: false })
    const fromSunday = getWeeklyLoadHistory([w], new Date('2024-01-07T18:00:00'), 3)
    const fromMonday = getWeeklyLoadHistory([w], MONDAY, 3)
    expect(fromSunday).toEqual(fromMonday)
  })
})

describe('getFitnessHistory', () => {
  it('returns an empty array when there are no workouts (nothing to warm up from)', () => {
    expect(getFitnessHistory([], MONDAY, 4)).toEqual([])
  })

  it('returns history entries with fitness/fatigue/form fields once a workout exists', () => {
    const w = makeWorkout({ date: '2024-01-01', tss: 100 })
    const result = getFitnessHistory([w], MONDAY, 4)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('fitness')
    expect(result[0]).toHaveProperty('fatigue')
    expect(result[0]).toHaveProperty('form')
  })
})
