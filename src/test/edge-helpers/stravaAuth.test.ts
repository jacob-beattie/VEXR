import { describe, it, expect } from 'vitest'
import { extractAuthCode, buildAthleteName } from '../../../supabase/functions/_shared/stravaAuth'

// Real code imported directly (like cors.test.ts) — strava-auth previously
// had zero tests at any level.

describe('extractAuthCode', () => {
  it('extracts a valid code', () => {
    expect(extractAuthCode({ code: 'abc123' })).toBe('abc123')
  })

  it('returns null when code is missing', () => {
    expect(extractAuthCode({})).toBeNull()
  })

  it('returns null when code is an empty string', () => {
    expect(extractAuthCode({ code: '' })).toBeNull()
  })

  it('returns null when code is the wrong type', () => {
    expect(extractAuthCode({ code: 12345 })).toBeNull()
    expect(extractAuthCode({ code: null })).toBeNull()
    expect(extractAuthCode({ code: ['abc'] })).toBeNull()
  })

  it('returns null for a non-object body', () => {
    expect(extractAuthCode(null)).toBeNull()
    expect(extractAuthCode('abc123')).toBeNull()
    expect(extractAuthCode(undefined)).toBeNull()
  })
})

describe('buildAthleteName', () => {
  it('joins first and last name', () => {
    expect(buildAthleteName({ firstname: 'Jane', lastname: 'Doe' })).toBe('Jane Doe')
  })

  it('falls back to just the first name when lastname is missing', () => {
    expect(buildAthleteName({ firstname: 'Jane' })).toBe('Jane')
  })

  it('falls back to just the last name when firstname is missing', () => {
    expect(buildAthleteName({ lastname: 'Doe' })).toBe('Doe')
  })

  it('returns null when both names are missing or empty', () => {
    expect(buildAthleteName({})).toBeNull()
    expect(buildAthleteName({ firstname: '', lastname: '' })).toBeNull()
  })

  it('returns null when athlete is null or undefined', () => {
    expect(buildAthleteName(null)).toBeNull()
    expect(buildAthleteName(undefined)).toBeNull()
  })
})
