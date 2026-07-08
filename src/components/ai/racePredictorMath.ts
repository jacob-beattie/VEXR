// Pure math/formatting helpers for RacePredictor.tsx, split into their own
// file (not colocated with the component) so they're directly testable and
// so exporting them doesn't trip react-refresh/only-export-components.

export interface RunRow { name: string; distanceKm: number; totalSeconds: number; paceSecondsPerKm: number }
export interface BikeRow { name: string; distanceKm: number; totalSeconds: number; avgSpeedKmh: number; avgPowerW: number }
export interface SwimRow { name: string; distanceM: number; totalSeconds: number; paceSeconds100m: number }
export interface TriRow {
  name: string
  swimSec: number; t1Sec: number; bikeSec: number; t2Sec: number; runSec: number
  totalSec: number
}

export interface NarrativeCache {
  narrative: string; generatedAt: number
  ctl: number; ftp: number; runPace: string; css: string
}

export function parsePace(pace: string): number | null {
  const p = pace.trim().split(':')
  if (p.length !== 2) return null
  const m = parseInt(p[0], 10), s = parseInt(p[1], 10)
  if (isNaN(m) || isNaN(s)) return null
  return m * 60 + s
}

// Rounds the *total* to a whole second first, then decomposes into h/m/s —
// rounding each unit independently (Math.floor(sec/60), Math.round(sec%60))
// can produce e.g. "3:60" instead of "4:00" when floating-point division
// leaves sec at 239.99999999999997 instead of an exact 240.
export function fmtTime(sec: number): string {
  const total = Math.round(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fmtPace(secPerKm: number): string {
  const total = Math.round(secPerKm)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}/km`
}

export function fmtPace100m(secPer100m: number): string {
  const total = Math.round(secPer100m)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}/100m`
}

export const HM_KM = 21.0975

export function calcRunRows(runPaceStr: string, ctl: number): RunRow[] {
  const baseSecPerKm = parsePace(runPaceStr)
  if (!baseSecPerKm) return []
  // Threshold pace ≈ half marathon race pace (approx 1 hour effort for most athletes)
  const t1Seconds = baseSecPerKm * HM_KM
  // Subtle CTL adjustment — capped at ±5%
  const ctlFactor = 1 - Math.min(0.05, Math.max(-0.05, (ctl - 30) * 0.001))
  const t1Adj = t1Seconds * ctlFactor
  return [
    { name: '5K', distanceKm: 5 },
    { name: '10K', distanceKm: 10 },
    { name: 'Half Marathon', distanceKm: HM_KM },
    { name: 'Marathon', distanceKm: 42.195 },
  ].map(r => {
    const totalSeconds = t1Adj * Math.pow(r.distanceKm / HM_KM, 1.06)
    return { ...r, totalSeconds, paceSecondsPerKm: totalSeconds / r.distanceKm }
  })
}

export function bikeSpeedKmh(powerW: number): number {
  return Math.pow(powerW / 0.239, 1 / 3) * 3.6
}

export function calcBikeRows(ftp: number, ctl: number): BikeRow[] {
  const adjFtp = ftp * (1 + (ctl - 30) * 0.002)
  return [
    { name: '40K TT', distanceKm: 40, intensityFactor: 1.05 },
    { name: '100K', distanceKm: 100, intensityFactor: 0.82 },
    { name: 'Gran Fondo (160K)', distanceKm: 160, intensityFactor: 0.75 },
  ].map(r => {
    const avgPowerW = Math.round(adjFtp * r.intensityFactor)
    const avgSpeedKmh = bikeSpeedKmh(avgPowerW)
    const totalSeconds = (r.distanceKm / avgSpeedKmh) * 3600
    return { name: r.name, distanceKm: r.distanceKm, totalSeconds, avgSpeedKmh, avgPowerW }
  })
}

export function calcSwimRows(cssStr: string): SwimRow[] {
  const base = parsePace(cssStr)
  if (!base) return []
  return [
    { name: '400m', distanceM: 400, intensityFactor: 1.05 },
    { name: '1500m', distanceM: 1500, intensityFactor: 0.97 },
    { name: '1900m (70.3 swim)', distanceM: 1900, intensityFactor: 0.94 },
    { name: '3800m (Ironman swim)', distanceM: 3800, intensityFactor: 0.90 },
  ].map(r => {
    const paceSeconds100m = base / r.intensityFactor
    const totalSeconds = (r.distanceM / 100) * paceSeconds100m
    return { name: r.name, distanceM: r.distanceM, totalSeconds, paceSeconds100m }
  })
}

export function calcTriRows(ftp: number, cssStr: string, runPaceStr: string, ctl: number): TriRow[] | null {
  const css = parsePace(cssStr)
  const runBase = parsePace(runPaceStr)
  if (!css || !runBase || !ftp) return null

  const adjFtp = ftp * (1 + (ctl - 30) * 0.002)
  const ctlFactor = 1 - Math.min(0.05, Math.max(-0.05, (ctl - 30) * 0.001))
  const adjRunPace = runBase * ctlFactor

  const swimSec = (distM: number, swimIF: number) => (distM / 100) * (css / swimIF)
  const bikeSec = (distKm: number, bikeIF: number) => {
    const power = adjFtp * bikeIF
    return (distKm / bikeSpeedKmh(power)) * 3600
  }
  const t1HM = adjRunPace * HM_KM
  const runSec = (distKm: number, brickFactor: number) =>
    t1HM * Math.pow(distKm / HM_KM, 1.06) * brickFactor

  const races = [
    {
      name: 'Sprint',
      swimM: 750, swimIF: 1.01, t1: 180,
      bikeKm: 20, bikeIF: 0.95, t2: 120,
      runKm: 5, brickFactor: 1.02,
    },
    {
      name: 'Olympic',
      swimM: 1500, swimIF: 0.97, t1: 180,
      bikeKm: 40, bikeIF: 0.90, t2: 120,
      runKm: 10, brickFactor: 1.03,
    },
    {
      name: 'Ironman 70.3',
      swimM: 1900, swimIF: 0.94, t1: 300,
      bikeKm: 90, bikeIF: 0.77, t2: 180,
      runKm: 21.1, brickFactor: 1.05,
    },
    {
      name: 'Ironman',
      swimM: 3800, swimIF: 0.90, t1: 480,
      bikeKm: 180, bikeIF: 0.67, t2: 300,
      runKm: 42.2, brickFactor: 1.08,
    },
  ]

  return races.map(r => {
    const sw = swimSec(r.swimM, r.swimIF)
    const bk = bikeSec(r.bikeKm, r.bikeIF)
    const rn = runSec(r.runKm, r.brickFactor)
    return {
      name: r.name,
      swimSec: sw, t1Sec: r.t1, bikeSec: bk, t2Sec: r.t2, runSec: rn,
      totalSec: sw + r.t1 + bk + r.t2 + rn,
    }
  })
}

export function metricsDrift(cached: NarrativeCache, ctl: number, ftp: number, runPace: string, css: string): boolean {
  const ctlDrift = Math.abs(ctl - cached.ctl) / Math.max(cached.ctl, 1) > 0.05
  const ftpDrift = Math.abs(ftp - cached.ftp) / Math.max(cached.ftp, 1) > 0.05
  const paceDrift = runPace !== cached.runPace
  const cssDrift = css !== cached.css
  return ctlDrift || ftpDrift || paceDrift || cssDrift
}
