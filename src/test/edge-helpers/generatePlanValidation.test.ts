import { describe, it, expect } from 'vitest'
import { validateGeneratePlanRequest } from '../../../supabase/functions/_shared/generatePlanValidation'

// Real code imported directly (like cors.test.ts) — this is the network
// trust boundary for generate-plan, previously untested at any level. A gap
// here lets a wrong-typed athleteProfile.ctl or an invalid date reach the
// Claude prompt / week-bucketing math unchecked.

const validBody = {
  sport: 'run',
  raceDistance: 'Marathon',
  raceDate: '2024-06-01',
  startDate: '2024-01-01',
  athleteProfile: { ctl: 50, primarySport: 'run' },
}

describe('validateGeneratePlanRequest', () => {
  it('accepts a minimal valid request', () => {
    const result = validateGeneratePlanRequest(validBody)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.sport).toBe('run')
      expect(result.value.athleteProfile).toEqual({ ctl: 50, primarySport: 'run', ftp: undefined, thresholdPace: undefined, css: undefined })
    }
  })

  it('rejects a non-object body', () => {
    expect(validateGeneratePlanRequest(null)).toEqual({ ok: false, error: 'Missing or invalid required fields' })
  })

  it('rejects a missing required top-level field', () => {
    const body: Record<string, unknown> = { ...validBody }
    delete body.sport
    expect(validateGeneratePlanRequest(body)).toEqual({ ok: false, error: 'Missing or invalid required fields' })
  })

  it('rejects when athleteProfile is missing', () => {
    const body: Record<string, unknown> = { ...validBody }
    delete body.athleteProfile
    expect(validateGeneratePlanRequest(body)).toEqual({ ok: false, error: 'Missing or invalid required fields' })
  })

  it('rejects when athleteProfile.ctl is a string instead of a number', () => {
    const body = { ...validBody, athleteProfile: { ctl: '50', primarySport: 'run' } }
    expect(validateGeneratePlanRequest(body)).toEqual({ ok: false, error: 'Missing or invalid required fields' })
  })

  it('rejects an invalid sport', () => {
    const body = { ...validBody, sport: 'chess' }
    expect(validateGeneratePlanRequest(body)).toEqual({ ok: false, error: 'Invalid sport' })
  })

  it('accepts every documented sport', () => {
    for (const sport of ['triathlon', 'run', 'bike', 'swim']) {
      expect(validateGeneratePlanRequest({ ...validBody, sport }).ok).toBe(true)
    }
  })

  it('rejects an empty race distance', () => {
    const body = { ...validBody, raceDistance: '' }
    expect(validateGeneratePlanRequest(body)).toEqual({ ok: false, error: 'Missing required fields' })
  })

  it('rejects a race distance over 100 characters', () => {
    const body = { ...validBody, raceDistance: 'x'.repeat(101) }
    expect(validateGeneratePlanRequest(body)).toEqual({ ok: false, error: 'Invalid race distance' })
  })

  it('rejects an invalid level', () => {
    const body = { ...validBody, level: 'expert' }
    expect(validateGeneratePlanRequest(body)).toEqual({ ok: false, error: 'Invalid level' })
  })

  it('accepts every documented level', () => {
    for (const level of ['beginner', 'intermediate', 'advanced']) {
      expect(validateGeneratePlanRequest({ ...validBody, level }).ok).toBe(true)
    }
  })

  it('rejects a malformed start date', () => {
    const body = { ...validBody, startDate: 'not-a-date' }
    expect(validateGeneratePlanRequest(body)).toEqual({ ok: false, error: 'Invalid date format' })
  })

  it('rejects a malformed race date', () => {
    const body = { ...validBody, raceDate: 'not-a-date' }
    expect(validateGeneratePlanRequest(body)).toEqual({ ok: false, error: 'Invalid date format' })
  })

  it('rejects a race date on or before the start date', () => {
    expect(validateGeneratePlanRequest({ ...validBody, raceDate: '2024-01-01', startDate: '2024-01-01' }))
      .toEqual({ ok: false, error: 'Race date must be after start date' })
    expect(validateGeneratePlanRequest({ ...validBody, raceDate: '2023-12-01', startDate: '2024-01-01' }))
      .toEqual({ ok: false, error: 'Race date must be after start date' })
  })

  it('rejects a non-array preferredDays', () => {
    const body = { ...validBody, preferredDays: 'Monday' }
    // preferredDays silently falls back to undefined for a non-array value —
    // request should still succeed, just without a day restriction.
    const result = validateGeneratePlanRequest(body)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.preferredDays).toBeUndefined()
  })

  it('carries through preferredDays when it is an array of strings', () => {
    const body = { ...validBody, preferredDays: ['Monday', 'Wednesday'] }
    const result = validateGeneratePlanRequest(body)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.preferredDays).toEqual(['Monday', 'Wednesday'])
  })
})
