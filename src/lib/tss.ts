import type { WorkoutBlock, WorkoutType } from '../types'

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
