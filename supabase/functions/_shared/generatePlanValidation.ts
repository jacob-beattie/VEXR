import { isRecord, type ValidationResult } from './validation.ts'

// Deno-global-free request-body validation for generate-plan, extracted so
// it's importable directly by Vitest (like cors.ts) instead of left
// untested — this is the network trust boundary before untrusted input
// reaches the Claude prompt string interpolation and the week-bucketing math.

export const VALID_SPORTS = ['triathlon', 'run', 'bike', 'swim'] as const
export const VALID_LEVELS = ['beginner', 'intermediate', 'advanced'] as const

export interface AthleteProfile {
  ctl: number
  ftp?: number
  thresholdPace?: string
  css?: string
  primarySport: string
}

export interface GeneratePlanRequest {
  sport: string
  raceDistance: string
  raceDate: string
  startDate: string
  preferredDays?: string[]
  level?: string
  goalTime?: string
  athleteProfile: AthleteProfile
}

function parseAthleteProfile(body: Record<string, unknown>): AthleteProfile | null {
  if (!isRecord(body.athleteProfile)) return null
  const ap = body.athleteProfile
  if (typeof ap.ctl !== 'number') return null
  if (typeof ap.primarySport !== 'string') return null

  return {
    ctl: ap.ctl,
    primarySport: ap.primarySport,
    ftp: typeof ap.ftp === 'number' ? ap.ftp : undefined,
    thresholdPace: typeof ap.thresholdPace === 'string' ? ap.thresholdPace : undefined,
    css: typeof ap.css === 'string' ? ap.css : undefined,
  }
}

export function validateGeneratePlanRequest(body: unknown): ValidationResult<GeneratePlanRequest> {
  if (!isRecord(body)) return { ok: false, error: 'Missing or invalid required fields' }
  if (typeof body.sport !== 'string') return { ok: false, error: 'Missing or invalid required fields' }
  if (typeof body.raceDistance !== 'string') return { ok: false, error: 'Missing or invalid required fields' }
  if (typeof body.raceDate !== 'string') return { ok: false, error: 'Missing or invalid required fields' }
  if (typeof body.startDate !== 'string') return { ok: false, error: 'Missing or invalid required fields' }

  const preferredDays = Array.isArray(body.preferredDays) && body.preferredDays.every(d => typeof d === 'string')
    ? body.preferredDays as string[]
    : undefined
  const level = typeof body.level === 'string' ? body.level : undefined
  const goalTime = typeof body.goalTime === 'string' ? body.goalTime : undefined

  const athleteProfile = parseAthleteProfile(body)
  if (!athleteProfile) return { ok: false, error: 'Missing or invalid required fields' }

  const { sport, raceDistance, raceDate, startDate } = body

  if (!sport || !raceDistance || !raceDate || !startDate) {
    return { ok: false, error: 'Missing required fields' }
  }
  if (!(VALID_SPORTS as readonly string[]).includes(sport)) {
    return { ok: false, error: 'Invalid sport' }
  }
  if (raceDistance.length === 0 || raceDistance.length > 100) {
    return { ok: false, error: 'Invalid race distance' }
  }
  if (level !== undefined && !(VALID_LEVELS as readonly string[]).includes(level)) {
    return { ok: false, error: 'Invalid level' }
  }
  const startMs = Date.parse(startDate)
  const raceMs = Date.parse(raceDate)
  if (isNaN(startMs) || isNaN(raceMs)) {
    return { ok: false, error: 'Invalid date format' }
  }
  if (raceMs <= startMs) {
    return { ok: false, error: 'Race date must be after start date' }
  }

  return {
    ok: true,
    value: { sport, raceDistance, raceDate, startDate, preferredDays, level, goalTime, athleteProfile },
  }
}
