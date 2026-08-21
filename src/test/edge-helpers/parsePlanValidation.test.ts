import { describe, it, expect } from 'vitest'
import { validateParsePlanRequest } from '../../../supabase/functions/_shared/parsePlanValidation'

// Real code imported directly (like cors.test.ts) — this is the network
// trust boundary for parse-plan, previously untested at any level.

describe('validateParsePlanRequest', () => {
  it('accepts a minimal valid request', () => {
    const result = validateParsePlanRequest({ content: 'Week 1: easy run', contentType: 'text' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.content).toBe('Week 1: easy run')
      expect(result.value.contentType).toBe('text')
      expect(result.value.startDate).toBeUndefined()
    }
  })

  it('carries through optional fields when present', () => {
    const result = validateParsePlanRequest({
      content: 'plan text', contentType: 'pdf', startDate: '2024-01-01', raceDate: '2024-06-01', planName: 'My Plan',
    })
    expect(result).toEqual({
      ok: true,
      value: { content: 'plan text', contentType: 'pdf', startDate: '2024-01-01', raceDate: '2024-06-01', planName: 'My Plan' },
    })
  })

  it('rejects a non-object body', () => {
    expect(validateParsePlanRequest(null)).toEqual({ ok: false, error: 'Missing content' })
    expect(validateParsePlanRequest('a string')).toEqual({ ok: false, error: 'Missing content' })
    expect(validateParsePlanRequest(undefined)).toEqual({ ok: false, error: 'Missing content' })
  })

  it('rejects a missing content field', () => {
    const result = validateParsePlanRequest({ contentType: 'text' })
    expect(result).toEqual({ ok: false, error: 'Missing content' })
  })

  it('rejects an empty content string', () => {
    const result = validateParsePlanRequest({ content: '', contentType: 'text' })
    expect(result).toEqual({ ok: false, error: 'Missing content' })
  })

  it('rejects a missing contentType field', () => {
    const result = validateParsePlanRequest({ content: 'plan text' })
    expect(result).toEqual({ ok: false, error: 'Missing content' })
  })

  it('rejects content over the 80,000 character limit', () => {
    const result = validateParsePlanRequest({ content: 'x'.repeat(80001), contentType: 'text' })
    expect(result).toEqual({ ok: false, error: 'content_too_large' })
  })

  it('accepts content exactly at the 80,000 character limit', () => {
    const result = validateParsePlanRequest({ content: 'x'.repeat(80000), contentType: 'text' })
    expect(result.ok).toBe(true)
  })

  it('rejects an invalid contentType', () => {
    const result = validateParsePlanRequest({ content: 'plan text', contentType: 'docx' })
    expect(result).toEqual({ ok: false, error: 'Invalid content type' })
  })

  it('rejects a malformed startDate', () => {
    const result = validateParsePlanRequest({ content: 'plan text', contentType: 'text', startDate: 'not-a-date' })
    expect(result).toEqual({ ok: false, error: 'Invalid start date format' })
  })

  it('rejects a malformed raceDate', () => {
    const result = validateParsePlanRequest({ content: 'plan text', contentType: 'text', raceDate: 'not-a-date' })
    expect(result).toEqual({ ok: false, error: 'Invalid race date format' })
  })

  it('rejects a numeric content field (wrong type reaching the Claude prompt boundary)', () => {
    const result = validateParsePlanRequest({ content: 12345, contentType: 'text' })
    expect(result).toEqual({ ok: false, error: 'Missing content' })
  })
})
