import { describe, it, expect } from 'vitest'
import {
  parseZone,
  parsePaceToSecs,
  getVolumeHistory,
  getZoneDistribution,
  getMonotony,
  getYTDStats,
  getBestPerformances,
  getPowerCurve,
  getPaceCurve,
  getHRZones,
} from '../analyticsDerivations'
import type { Workout } from '../../types'

// toISOString() converts to UTC, which shifts the date by a day depending on the machine's
// timezone/time-of-day (the exact pitfall dateUtils.ts's own localDateKey guards against) —
// use local date parts instead so these fixtures are correct in any timezone.
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as Workout
}

describe('parseZone', () => {
  it('extracts a numeric zone from a "Zone N" style string', () => {
    expect(parseZone('Zone 3')).toBe('Zone 3')
  })
  it('maps Session Focus labels to zones', () => {
    expect(parseZone('Recovery')).toBe('Zone 1')
    expect(parseZone('Endurance')).toBe('Zone 2')
    expect(parseZone('Tempo')).toBe('Zone 3')
    expect(parseZone('Threshold')).toBe('Zone 4')
    expect(parseZone('Intervals')).toBe('Zone 5')
  })
  it('returns Unspecified for null/undefined/empty', () => {
    expect(parseZone(null)).toBe('Unspecified')
    expect(parseZone(undefined)).toBe('Unspecified')
    expect(parseZone('')).toBe('Unspecified')
  })
})

describe('parsePaceToSecs', () => {
  it('converts mm:ss to seconds', () => {
    expect(parsePaceToSecs('4:30')).toBe(270)
  })
  it('returns null for malformed input', () => {
    expect(parsePaceToSecs(null)).toBeNull()
    expect(parsePaceToSecs('bad')).toBeNull()
    expect(parsePaceToSecs('4:xx')).toBeNull()
  })
})

describe('getVolumeHistory', () => {
  it('sums duration in hours per sport per week', () => {
    const w = makeWorkout({ type: 'run', duration_minutes: 120, date: dateKey(new Date()) })
    const result = getVolumeHistory([w], 1)
    expect(result).toHaveLength(1)
    expect(result[0].run).toBe(2)
    expect(result[0].ride).toBe(0)
  })
  it('excludes planned workouts', () => {
    const w = makeWorkout({ type: 'run', duration_minutes: 120, planned: true, date: dateKey(new Date()) })
    const result = getVolumeHistory([w], 1)
    expect(result[0].run).toBe(0)
  })
})

describe('getZoneDistribution', () => {
  it('buckets minutes by zone and computes percentages', () => {
    const rangeStart = new Date('2024-01-01T00:00:00')
    const workouts = [
      makeWorkout({ date: '2024-01-02', zone: 'Zone 1', duration_minutes: 30 }),
      makeWorkout({ date: '2024-01-03', zone: 'Zone 1', duration_minutes: 30 }),
      makeWorkout({ date: '2024-01-04', zone: 'Zone 2', duration_minutes: 40 }),
    ]
    const result = getZoneDistribution(workouts, rangeStart)
    const z1 = result.find(z => z.zone === 'Zone 1')!
    const z2 = result.find(z => z.zone === 'Zone 2')!
    expect(z1.minutes).toBe(60)
    expect(z2.minutes).toBe(40)
    expect(z1.pct + z2.pct).toBe(100)
  })
  it('excludes workouts before rangeStart', () => {
    const rangeStart = new Date('2024-06-01T00:00:00')
    const workouts = [makeWorkout({ date: '2024-01-01', zone: 'Zone 1', duration_minutes: 30 })]
    expect(getZoneDistribution(workouts, rangeStart)).toEqual([])
  })
})

describe('getMonotony', () => {
  // Mirrors getMonotony's own window construction (today, minus `weeks*7` days, for `weeks*7`
  // days) so fixtures land on the exact days the function reads — this is fixture setup to
  // avoid an off-by-one/timezone mismatch, not a re-implementation of the statistic under test.
  function windowDay(offsetFromWindowStart: number): string {
    const now = new Date()
    now.setHours(23, 59, 59, 999)
    const start = new Date(now)
    start.setDate(now.getDate() - 7)
    start.setHours(0, 0, 0, 0)
    const d = new Date(start)
    d.setDate(start.getDate() + offsetFromWindowStart)
    return dateKey(d)
  }

  it('returns null when there is no training load at all', () => {
    expect(getMonotony([], 4)).toBeNull()
  })
  it('returns null when every day in the window has identical TSS (zero stddev)', () => {
    const workouts = Array.from({ length: 7 }, (_, i) => makeWorkout({ date: windowDay(i), tss: 50 }))
    expect(getMonotony(workouts, 1)).toBeNull()
  })
  it('computes avg / stddev for varied daily TSS', () => {
    // One day with TSS 100, rest of the 7-day window at 0 — hand-computable avg/stddev.
    const w = makeWorkout({ date: windowDay(3), tss: 100 })
    const result = getMonotony([w], 1)
    const avg = 100 / 7
    const variance = ((100 - avg) ** 2 + 6 * (0 - avg) ** 2) / 7
    const expected = Math.round((avg / Math.sqrt(variance)) * 100) / 100
    expect(result).toBe(expected)
  })
})

describe('getYTDStats', () => {
  it('only counts completed workouts from the current year', () => {
    const year = new Date().getFullYear()
    const thisYear = makeWorkout({ date: `${year}-02-01`, duration_minutes: 60, distance_meters: 10000, tss: 50 })
    const lastYear = makeWorkout({ date: `${year - 1}-02-01`, duration_minutes: 60, tss: 50 })
    const planned = makeWorkout({ date: `${year}-02-02`, planned: true, tss: 999 })
    const result = getYTDStats([thisYear, lastYear, planned])
    expect(result.count).toBe(1)
    expect(result.hours).toBe(1)
    expect(result.distanceKm).toBe(10)
    expect(result.tss).toBe(50)
  })
})

describe('getBestPerformances', () => {
  const rangeStart = new Date('2024-01-01T00:00:00')

  it('picks the longest run and ride by distance', () => {
    const workouts = [
      makeWorkout({ type: 'run', date: '2024-01-02', distance_meters: 5000 }),
      makeWorkout({ type: 'run', date: '2024-01-03', distance_meters: 10000 }),
      makeWorkout({ type: 'ride', date: '2024-01-04', distance_meters: 40000 }),
    ]
    const result = getBestPerformances(workouts, rangeStart)
    expect(result.longestRun?.distance_meters).toBe(10000)
    expect(result.longestRide?.distance_meters).toBe(40000)
  })

  it('picks the highest single-workout TSS and best TSS week', () => {
    const workouts = [
      makeWorkout({ date: '2024-01-01', tss: 80 }),
      makeWorkout({ date: '2024-01-02', tss: 120 }),
    ]
    const result = getBestPerformances(workouts, rangeStart)
    expect(result.highestTSS?.tss).toBe(120)
    expect(result.bestWeekTSS).toBe(200) // both fall in the same Mon-Sun week
  })

  it('counts workouts per sport', () => {
    const workouts = [
      makeWorkout({ type: 'run', date: '2024-01-01' }),
      makeWorkout({ type: 'run', date: '2024-01-02' }),
      makeWorkout({ type: 'ride', date: '2024-01-03' }),
    ]
    const result = getBestPerformances(workouts, rangeStart)
    expect(result.sportCounts.run).toBe(2)
    expect(result.sportCounts.ride).toBe(1)
  })
})

describe('getPowerCurve', () => {
  const rangeStart = new Date('2024-01-01T00:00:00')

  it('returns empty when there are no rides with power data', () => {
    expect(getPowerCurve([], rangeStart, 200)).toEqual([])
  })

  it('picks the best avg_power for each duration band and computes %FTP', () => {
    const workouts = [
      makeWorkout({ type: 'ride', date: '2024-01-02', duration_minutes: 10, avg_power: 250 }),
      makeWorkout({ type: 'ride', date: '2024-01-03', duration_minutes: 60, avg_power: 200 }),
    ]
    const result = getPowerCurve(workouts, rangeStart, 200)
    const fiveMin = result.find(b => b.label === '5m')!
    const sixtyMin = result.find(b => b.label === '60m')!
    expect(fiveMin.watts).toBe(250) // both candidates qualify for the >=3min band, best wins
    expect(sixtyMin.watts).toBe(200) // only the 60-min ride qualifies for the 45min+ band
    expect(sixtyMin.pctFtp).toBe(100)
  })
})

describe('getPaceCurve', () => {
  const rangeStart = new Date('2024-01-01T00:00:00')

  it('returns empty when there are no qualifying runs', () => {
    expect(getPaceCurve([], rangeStart)).toEqual([])
  })

  it('computes pace from distance+duration when avg_pace is not stored', () => {
    // 5km in 25 minutes = 5:00/km
    const w = makeWorkout({ type: 'run', date: '2024-01-02', distance_meters: 5000, duration_minutes: 25 })
    const result = getPaceCurve([w], rangeStart)
    const fiveK = result.find(b => b.label === '5K')!
    expect(fiveK.paceStr).toBe('5:00/km')
  })

  it('ignores paces slower than 10 min/km (walks/hikes mistagged as runs)', () => {
    const w = makeWorkout({ type: 'run', date: '2024-01-02', distance_meters: 5000, duration_minutes: 60 })
    expect(getPaceCurve([w], rangeStart)).toEqual([])
  })
})

describe('getHRZones', () => {
  const rangeStart = new Date('2024-01-01T00:00:00')
  const boundaries = [
    { min: 0, max: 120 },
    { min: 121, max: 140 },
    { min: 141, max: 155 },
    { min: 156, max: 170 },
    { min: 171, max: null },
  ]

  it('buckets minutes into the correct zone by avg heart rate', () => {
    const workouts = [
      makeWorkout({ date: '2024-01-02', heart_rate_avg: 110, duration_minutes: 30 }),
      makeWorkout({ date: '2024-01-03', heart_rate_avg: 175, duration_minutes: 20 }),
    ]
    const result = getHRZones(workouts, rangeStart, boundaries)
    expect(result.total).toBe(50)
    expect(result.zones[0].minutes).toBe(30) // Zone 1
    expect(result.zones[4].minutes).toBe(20) // Zone 5
  })

  it('excludes workouts with no heart rate logged', () => {
    const w = makeWorkout({ date: '2024-01-02', duration_minutes: 30 })
    const result = getHRZones([w], rangeStart, boundaries)
    expect(result.total).toBe(0)
  })
})
