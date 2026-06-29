/**
 * Tests for pure logic extracted from supabase/functions/strava-sync/index.ts.
 * These functions are duplicated here (not imported) because the edge function uses
 * Deno globals. The tests validate the logic is correct and guard against regressions.
 */
import { describe, it, expect } from 'vitest'

// ─── mapStravaType ─────────────────────────────────────────────────────────────

function mapStravaType(sportType: string): string {
  const runTypes = ['Run', 'TrailRun', 'VirtualRun', 'Hike', 'Walk']
  const rideTypes = ['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide', 'Handcycle']
  const swimTypes = ['Swim', 'OpenWaterSwim']
  const strengthTypes = [
    'WeightTraining', 'Workout', 'Yoga', 'Pilates', 'Crossfit',
    'Elliptical', 'StairStepper', 'Rowing', 'RockClimbing',
  ]
  if (runTypes.includes(sportType)) return 'run'
  if (rideTypes.includes(sportType)) return 'ride'
  if (swimTypes.includes(sportType)) return 'swim'
  if (strengthTypes.includes(sportType)) return 'strength'
  return 'run'
}

// ─── estimateTSS ──────────────────────────────────────────────────────────────

function estimateTSS(
  activity: Record<string, unknown>,
  type: string,
  ftp: number,
  threshPaceSec: number,
  cssSec: number,
): number {
  const movingTime = typeof activity.moving_time === 'number' ? (activity.moving_time as number) : 0
  const durationHrs = movingTime / 3600

  if (type === 'ride' && ftp > 0) {
    const np = typeof activity.weighted_average_watts === 'number'
      ? (activity.weighted_average_watts as number)
      : typeof activity.average_watts === 'number'
        ? (activity.average_watts as number)
        : 0
    if (np > 0) {
      const ifVal = np / ftp
      return Math.round(durationHrs * ifVal * ifVal * 100)
    }
  }

  if (type === 'run' && threshPaceSec > 0) {
    const distanceM = typeof activity.distance === 'number' ? (activity.distance as number) : 0
    if (distanceM > 0 && movingTime > 0) {
      const avgPaceSec = movingTime / (distanceM / 1000)
      const ifVal = threshPaceSec / avgPaceSec
      return Math.round(durationHrs * ifVal * ifVal * 100)
    }
  }

  if (type === 'swim' && cssSec > 0) {
    const distanceM = typeof activity.distance === 'number' ? (activity.distance as number) : 0
    if (distanceM > 0 && movingTime > 0) {
      const avgPaceSec = movingTime / (distanceM / 100)
      const ifVal = cssSec / avgPaceSec
      return Math.round(durationHrs * ifVal * ifVal * 100)
    }
  }

  if (typeof activity.suffer_score === 'number' && activity.suffer_score > 0) {
    return Math.round(activity.suffer_score as number)
  }

  return Math.round(durationHrs * 50)
}

// ─── Tests: mapStravaType ──────────────────────────────────────────────────────

describe('mapStravaType', () => {
  it.each(['Run', 'TrailRun', 'VirtualRun', 'Hike', 'Walk'])('maps %s → run', (type) => {
    expect(mapStravaType(type)).toBe('run')
  })

  it.each(['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide', 'Handcycle'])(
    'maps %s → ride', (type) => {
    expect(mapStravaType(type)).toBe('ride')
  })

  it.each(['Swim', 'OpenWaterSwim'])('maps %s → swim', (type) => {
    expect(mapStravaType(type)).toBe('swim')
  })

  it.each(['WeightTraining', 'Workout', 'Yoga', 'Pilates', 'Crossfit', 'Elliptical', 'StairStepper', 'Rowing', 'RockClimbing'])(
    'maps %s → strength', (type) => {
    expect(mapStravaType(type)).toBe('strength')
  })

  it('defaults unknown types to run', () => {
    expect(mapStravaType('Kitesurfing')).toBe('run')
    expect(mapStravaType('')).toBe('run')
  })
})

// ─── Tests: estimateTSS ────────────────────────────────────────────────────────

describe('estimateTSS — ride with power', () => {
  it('calculates TSS=100 for 1hr at exactly FTP (IF=1.0)', () => {
    const activity = { moving_time: 3600, weighted_average_watts: 250 }
    expect(estimateTSS(activity, 'ride', 250, 0, 0)).toBe(100)
  })

  it('calculates TSS=81 for 1hr at 90% FTP (IF=0.9)', () => {
    const activity = { moving_time: 3600, weighted_average_watts: 225 }
    expect(estimateTSS(activity, 'ride', 250, 0, 0)).toBe(81)
  })

  it('uses average_watts when weighted_average_watts is missing', () => {
    const activity = { moving_time: 3600, average_watts: 250 }
    expect(estimateTSS(activity, 'ride', 250, 0, 0)).toBe(100)
  })

  it('falls back when no power data', () => {
    const activity = { moving_time: 3600 }
    // No power → falls through to 50 TSS/hr fallback
    expect(estimateTSS(activity, 'ride', 250, 0, 0)).toBe(50)
  })
})

describe('estimateTSS — run with pace', () => {
  it('calculates TSS=100 for 1hr at threshold pace', () => {
    // threshold pace = 270 sec/km (4:30/km), distance = 1000/270 * 3600 = 13333m
    const threshPace = 270
    const movingTime = 3600
    const distanceM = (movingTime / threshPace) * 1000
    const activity = { moving_time: movingTime, distance: distanceM }
    expect(estimateTSS(activity, 'run', 0, threshPace, 0)).toBe(100)
  })

  it('calculates lower TSS for slower than threshold pace', () => {
    const threshPace = 270
    const movingTime = 3600
    const slowerDistM = (movingTime / 300) * 1000 // 5:00/km pace
    const activity = { moving_time: movingTime, distance: slowerDistM }
    const tss = estimateTSS(activity, 'run', 0, threshPace, 0)
    // IF = 270/300 = 0.9, TSS ≈ 81
    expect(tss).toBe(81)
  })

  it('falls back when no distance data', () => {
    const activity = { moving_time: 3600 }
    expect(estimateTSS(activity, 'run', 0, 270, 0)).toBe(50)
  })
})

describe('estimateTSS — swim with CSS', () => {
  it('calculates TSS=100 for CSS pace over 1hr', () => {
    // CSS = 100 sec/100m; distance = 3600m in 3600s → exactly CSS pace
    const cssSec = 100
    const movingTime = 3600
    const distanceM = 3600
    const activity = { moving_time: movingTime, distance: distanceM }
    expect(estimateTSS(activity, 'swim', 0, 0, cssSec)).toBe(100)
  })

  it('falls back when CSS is 0', () => {
    const activity = { moving_time: 3600, distance: 3000 }
    expect(estimateTSS(activity, 'swim', 0, 0, 0)).toBe(50)
  })
})

describe('estimateTSS — fallbacks', () => {
  it('uses suffer_score when present and no type-specific data', () => {
    const activity = { moving_time: 3600, suffer_score: 75 }
    expect(estimateTSS(activity, 'run', 0, 0, 0)).toBe(75)
  })

  it('falls back to 50 TSS/hr as last resort', () => {
    const activity = { moving_time: 7200 } // 2hrs
    expect(estimateTSS(activity, 'run', 0, 0, 0)).toBe(100) // 2hrs × 50
  })

  it('returns 0 for 0 moving_time', () => {
    const activity = { moving_time: 0 }
    expect(estimateTSS(activity, 'run', 0, 0, 0)).toBe(0)
  })
})
