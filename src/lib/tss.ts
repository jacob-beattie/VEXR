import type { WorkoutBlock, WorkoutType } from '../types'

// ─── TSS / IF domain notes ──────────────────────────────────────────────────
//
// TSS (Training Stress Score) is the input to the PMC engine (see calculateMetrics.ts for
// CTL/ATL/TSB). The standard TrainingPeaks formula used throughout this file is:
//
//   TSS = duration_hours × IF² × 100
//
// IF (Intensity Factor) is how hard a session was relative to threshold — 1.0 means the whole
// session was done exactly at threshold pace/power/CSS. It's squared deliberately: TrainingPeaks'
// methodology treats intensity as a quadratic cost, so a session done further above threshold
// contributes disproportionately more load than the same duration done nearer threshold — an
// hour at IF 1.2 (44 TSS more) counts for much more than an hour at IF 1.0, not just 20% more.
// This is why a short hard interval session can score a similar or higher TSS than a much longer
// easy one.
//
// Per-sport IF is threshold-relative in different units:
//   - run:  IF = threshold pace (sec/km) ÷ actual pace (sec/km) — faster than threshold → IF > 1
//   - ride: IF = avg power (W) ÷ FTP (W)
//   - swim: IF = CSS (sec/100m) ÷ actual pace (sec/100m), where actual pace is derived from
//           total swim duration over total distance, normalised to a per-100m rate first
//           (`durationMinutes × 60 ÷ (swimDistance / 100)`) so it's comparable to CSS's own units

export function paceToSeconds(pace: string): number {
  const parts = pace.split(':')
  if (parts.length !== 2) return 0
  const mins = parseInt(parts[0]) || 0
  const secs = parseInt(parts[1]) || 0
  return mins * 60 + secs
}

export function secsToPaceStr(secs: number): string {
  if (!secs || secs <= 0) return ''
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function computeSimpleTSS(
  type: WorkoutType, durationMinutes: number,
  avgPace: string, avgPower: number, swimDistance: number, rpe: number,
  ftp: number, threshPace: string, css: string,
): number {
  const durationHrs = durationMinutes / 60
  if (type === 'run') {
    const threshSec = paceToSeconds(threshPace)
    const avgSec = paceToSeconds(avgPace)
    if (!threshSec || !avgSec) return 0
    const IF = threshSec / avgSec
    return Math.round(durationHrs * IF * IF * 100)
  }
  if (type === 'ride') {
    if (!ftp || !avgPower) return 0
    const IF = avgPower / ftp
    return Math.round(durationHrs * IF * IF * 100)
  }
  if (type === 'swim') {
    const cssSec = paceToSeconds(css)
    if (!cssSec || !swimDistance || !durationMinutes) return 0
    const avgPacePer100m = (durationMinutes * 60) / (swimDistance / 100)
    const IF = cssSec / avgPacePer100m
    return Math.round(durationHrs * IF * IF * 100)
  }
  if (type === 'strength' || type === 'rest') {
    return Math.round(durationMinutes * rpe * 0.5)
  }
  return 0
}

function blockIF(block: WorkoutBlock, type: WorkoutType, threshPace: string): number {
  if (type === 'ride' || type === 'swim') {
    const pct = parseFloat(block.intensity)
    return pct > 0 ? pct / 100 : 0
  }
  if (type === 'run') {
    const threshSec = paceToSeconds(threshPace)
    const avgSec = paceToSeconds(block.intensity)
    return threshSec > 0 && avgSec > 0 ? threshSec / avgSec : 0
  }
  return 0
}

export function computeStructuredTSS(blocks: WorkoutBlock[], type: WorkoutType, threshPace: string): number {
  return blocks.reduce((sum, block) => {
    const durationHrs = (block.durationMinutes * block.reps) / 60
    const IF = blockIF(block, type, threshPace)
    return sum + Math.round(durationHrs * IF * IF * 100)
  }, 0)
}

export function computeStructuredDuration(blocks: WorkoutBlock[]): number {
  return blocks.reduce((sum, b) => sum + b.durationMinutes * b.reps, 0)
}
