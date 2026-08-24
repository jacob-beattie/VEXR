import { HR_ZONE_RAMP } from './colors'
import { getWeekStart, getWeekEnd } from './dateUtils'
import { paceToSeconds } from './tss'
import type { Workout } from '../types'

// Pure derivation functions for the Analytics deep-dive page, extracted out of
// AnalyticsPage.tsx (mirrors the calculateMetrics.ts / workoutSelectors.ts pattern: derived
// values computed once from `workouts` as plain functions, not recalculated inline in the
// component). AnalyticsPage.tsx keeps only presentation + these functions' call sites.

// Mirrors the private `localDateKey` copy in calculateMetrics.ts — this file lives in the same
// clean lib/ leaf layer (no imports from components/contexts/pages), so it can't reach the
// canonical copy in components/dashboard/utils.ts without inverting that dependency direction.
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Each band shows best avg_power from rides of AT LEAST this duration.
// This keeps the curve physiologically correct (shorter = higher or equal power).
const POWER_BANDS = [
  { label: '5m',  minMin: 3  },
  { label: '10m', minMin: 8  },
  { label: '20m', minMin: 15 },
  { label: '30m', minMin: 25 },
  { label: '60m', minMin: 45 },
]

const PACE_BANDS = [
  { label: '5K',  minKm: 4,  maxKm: 7  },
  { label: '10K', minKm: 8,  maxKm: 12 },
  { label: '15K', minKm: 13, maxKm: 17 },
  { label: 'HM',  minKm: 19, maxKm: 23 },
  { label: 'Mar', minKm: 40, maxKm: 45 },
]

export const HR_ZONE_COLORS = HR_ZONE_RAMP
export const HR_ZONE_LABELS = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5']

export function parseZone(zone: string | null | undefined): string {
  if (!zone) return 'Unspecified'
  const match = zone.match(/(\d+)/)
  if (match) return `Zone ${match[1]}`
  const lower = zone.toLowerCase()
  if (lower.includes('recov')) return 'Zone 1'
  if (lower === 'endurance' || lower === 'long' || lower.includes('aerob')) return 'Zone 2'
  if (lower.includes('tempo')) return 'Zone 3'
  if (lower.includes('thresh')) return 'Zone 4'
  if (lower === 'intervals' || lower === 'race' || lower.includes('vo2') || lower.includes('v02')) return 'Zone 5'
  return zone
}

export function parsePaceToSecs(pace: string | null | undefined): number | null {
  if (!pace) return null
  const parts = pace.split(':')
  if (parts.length !== 2 || isNaN(parseInt(parts[0])) || isNaN(parseInt(parts[1]))) return null
  return paceToSeconds(pace)
}

export function getVolumeHistory(workouts: Workout[], weeks: number) {
  const now = new Date()
  const currentWeekStart = getWeekStart(now)
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(currentWeekStart)
    weekStart.setDate(currentWeekStart.getDate() - (weeks - 1 - i) * 7)
    const weekEnd = getWeekEnd(weekStart)

    const ww = workouts.filter(w => {
      const d = new Date(w.date + 'T00:00:00')
      return d >= weekStart && d <= weekEnd && !w.planned
    })

    return {
      week: formatDateLabel(weekStart),
      run:      +(ww.filter(w => w.type === 'run').reduce((s, w)      => s + (w.duration_minutes || 0), 0) / 60).toFixed(1),
      ride:     +(ww.filter(w => w.type === 'ride').reduce((s, w)     => s + (w.duration_minutes || 0), 0) / 60).toFixed(1),
      swim:     +(ww.filter(w => w.type === 'swim').reduce((s, w)     => s + (w.duration_minutes || 0), 0) / 60).toFixed(1),
      strength: +(ww.filter(w => w.type === 'strength').reduce((s, w) => s + (w.duration_minutes || 0), 0) / 60).toFixed(1),
    }
  })
}

export function getZoneDistribution(workouts: Workout[], rangeStart: Date) {
  const completed = workouts.filter(w => {
    if (w.planned || !w.duration_minutes) return false
    return new Date(w.date + 'T00:00:00') >= rangeStart
  })
  const totals: Record<string, number> = {}
  for (const w of completed) {
    const z = parseZone(w.zone)
    totals[z] = (totals[z] || 0) + (w.duration_minutes || 0)
  }
  const total = Object.values(totals).reduce((s, v) => s + v, 0)
  return Object.entries(totals)
    .map(([zone, minutes]) => ({ zone, minutes, pct: total > 0 ? Math.round((minutes / total) * 100) : 0 }))
    .sort((a, b) => {
      const numA = parseInt(a.zone.replace(/\D/g, '')) || 99
      const numB = parseInt(b.zone.replace(/\D/g, '')) || 99
      return numA - numB
    })
}

// Monotony = avg daily TSS / stddev of daily TSS over the range
export function getMonotony(workouts: Workout[], weeks: number): number | null {
  const now = new Date()
  now.setHours(23, 59, 59, 999)
  const start = new Date(now)
  start.setDate(now.getDate() - weeks * 7)
  start.setHours(0, 0, 0, 0)

  const tssByDay: Record<string, number> = {}
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    tssByDay[localDateKey(d)] = 0
  }
  workouts.filter(w => !w.planned).forEach(w => {
    const key = w.date.split('T')[0]
    if (key in tssByDay) tssByDay[key] += w.tss || 0
  })

  const values = Object.values(tssByDay)
  const avg = values.reduce((s, v) => s + v, 0) / values.length
  if (avg === 0) return null
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length
  const stddev = Math.sqrt(variance)
  if (stddev === 0) return null
  return Math.round((avg / stddev) * 100) / 100
}

export function getYTDStats(workouts: Workout[]) {
  const year = new Date().getFullYear()
  const completed = workouts.filter(w => {
    if (w.planned) return false
    const d = new Date(w.date + 'T00:00:00')
    return d.getFullYear() === year
  })
  return {
    count: completed.length,
    hours: +(completed.reduce((s, w) => s + (w.duration_minutes || 0), 0) / 60).toFixed(1),
    distanceKm: +(completed.reduce((s, w) => s + (w.distance_meters || 0), 0) / 1000).toFixed(0),
    tss: completed.reduce((s, w) => s + (w.tss || 0), 0),
  }
}

export function getBestPerformances(workouts: Workout[], rangeStart: Date) {
  const completed = workouts.filter(w => !w.planned && new Date(w.date + 'T00:00:00') >= rangeStart)

  const longestRun = completed
    .filter(w => w.type === 'run' && w.distance_meters)
    .sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0))[0] ?? null

  const longestRide = completed
    .filter(w => w.type === 'ride' && w.distance_meters)
    .sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0))[0] ?? null

  const highestTSS = completed
    .filter(w => w.tss > 0)
    .sort((a, b) => b.tss - a.tss)[0] ?? null

  const tssByWeek: Record<string, number> = {}
  completed.forEach(w => {
    const d = new Date(w.date + 'T00:00:00')
    const key = localDateKey(getWeekStart(d))
    tssByWeek[key] = (tssByWeek[key] || 0) + (w.tss || 0)
  })
  const bestWeekTSS = Object.values(tssByWeek).length > 0
    ? Math.max(...Object.values(tssByWeek))
    : 0

  const sportCounts = completed.reduce<Record<string, number>>((acc, w) => {
    acc[w.type] = (acc[w.type] || 0) + 1
    return acc
  }, {})

  return { longestRun, longestRide, highestTSS, bestWeekTSS, sportCounts }
}

export function getPowerCurve(workouts: Workout[], rangeStart: Date, ftp: number) {
  const rides = workouts.filter(w =>
    !w.planned && w.type === 'ride' && w.avg_power && w.avg_power > 0 &&
    new Date(w.date + 'T00:00:00') >= rangeStart
  )
  if (rides.length === 0) return []

  return POWER_BANDS.map(band => {
    const candidates = rides.filter(w => w.duration_minutes >= band.minMin)
    if (candidates.length === 0) return null
    const watts = Math.max(...candidates.map(w => w.avg_power!))
    const pctFtp = ftp > 0 ? Math.round((watts / ftp) * 100) : null
    return { label: band.label, watts, pctFtp }
  }).filter(Boolean) as Array<{ label: string; watts: number; pctFtp: number | null }>
}

export function getPaceCurve(workouts: Workout[], rangeStart: Date) {
  // Accept any run with distance — calculate pace from distance+duration if avg_pace not stored
  const runs = workouts.filter(w =>
    !w.planned && w.type === 'run' &&
    w.distance_meters && w.distance_meters > 0 &&
    w.duration_minutes && w.duration_minutes > 0 &&
    new Date(w.date + 'T00:00:00') >= rangeStart
  )
  if (runs.length === 0) return []

  return PACE_BANDS.map(band => {
    const candidates = runs.filter(w => {
      const km = (w.distance_meters || 0) / 1000
      return km >= band.minKm && km <= band.maxKm
    })
    if (candidates.length === 0) return null
    let bestSecs = Infinity
    for (const w of candidates) {
      // Prefer stored avg_pace; fall back to duration/distance
      let secs = parsePaceToSecs(w.avg_pace)
      if (secs === null) {
        const km = w.distance_meters! / 1000
        secs = (w.duration_minutes * 60) / km
      }
      // Ignore anything slower than 10 min/km — walks/hikes mapped to run type
      if (secs !== null && secs < 600 && secs < bestSecs) bestSecs = secs
    }
    if (bestSecs === Infinity) return null
    const speedKmh = parseFloat((3600 / bestSecs).toFixed(2))
    const paceStr = `${Math.floor(bestSecs / 60)}:${String(Math.round(bestSecs % 60)).padStart(2, '0')}/km`
    return { label: band.label, speedKmh, paceStr }
  }).filter(Boolean) as Array<{ label: string; speedKmh: number; paceStr: string }>
}

export function getHRZones(workouts: Workout[], rangeStart: Date, boundaries: Array<{ min: number; max: number | null }>) {
  const relevant = workouts.filter(w => {
    if (w.planned || !w.heart_rate_avg || !w.duration_minutes) return false
    const d = new Date(w.date + 'T00:00:00')
    return d >= rangeStart
  })

  const zoneMinutes = [0, 0, 0, 0, 0]
  for (const w of relevant) {
    const hr = w.heart_rate_avg!
    let idx = boundaries.length - 1
    for (let i = 0; i < boundaries.length; i++) {
      const b = boundaries[i]
      if (hr >= b.min && (b.max === null || hr <= b.max)) { idx = i; break }
    }
    if (idx < zoneMinutes.length) zoneMinutes[idx] += w.duration_minutes
  }

  const total = zoneMinutes.reduce((s, v) => s + v, 0)
  return {
    total,
    zones: zoneMinutes.map((mins, i) => ({
      zone: HR_ZONE_LABELS[i],
      minutes: mins,
      pct: total > 0 ? Math.round((mins / total) * 100) : 0,
      color: HR_ZONE_COLORS[i],
    })),
  }
}
