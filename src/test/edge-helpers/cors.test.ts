import { describe, it, expect } from 'vitest'
import { parseAllowedOrigins, getCorsHeaders } from '../../../supabase/functions/_shared/cors'

describe('parseAllowedOrigins', () => {
  it('returns empty array when env var is not set', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([])
    expect(parseAllowedOrigins('')).toEqual([])
  })

  it('strips trailing slashes', () => {
    const result = parseAllowedOrigins('https://www.vexr.app/')
    expect(result).toContain('https://www.vexr.app')
    expect(result).not.toContain('https://www.vexr.app/')
  })

  it('does not double-strip origins without trailing slash', () => {
    const result = parseAllowedOrigins('https://www.vexr.app')
    expect(result).toContain('https://www.vexr.app')
  })

  it('splits comma-separated origins and strips each', () => {
    const result = parseAllowedOrigins('https://www.vexr.app/, https://staging.vexr.app/')
    expect(result).toContain('https://www.vexr.app')
    expect(result).toContain('https://staging.vexr.app')
    expect(result).not.toContain('https://www.vexr.app/')
    expect(result).not.toContain('https://staging.vexr.app/')
  })

  it('always appends localhost entries when a prod origin is set', () => {
    const result = parseAllowedOrigins('https://www.vexr.app')
    expect(result).toContain('http://localhost:5173')
    expect(result).toContain('http://localhost:3000')
  })

  it('does not append localhost entries when env var is unset', () => {
    expect(parseAllowedOrigins(undefined)).not.toContain('http://localhost:5173')
  })
})

describe('getCorsHeaders', () => {
  const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type'

  it('returns wildcard when allowedOrigins is empty (local dev)', () => {
    const headers = getCorsHeaders('http://localhost:5173', [])
    expect(headers['Access-Control-Allow-Origin']).toBe('*')
    expect(headers['Access-Control-Allow-Headers']).toBe(ALLOW_HEADERS)
  })

  it('echoes the exact origin when it is in the allowlist', () => {
    const origins = ['https://www.vexr.app', 'http://localhost:5173']
    expect(getCorsHeaders('https://www.vexr.app', origins)['Access-Control-Allow-Origin'])
      .toBe('https://www.vexr.app')
    expect(getCorsHeaders('http://localhost:5173', origins)['Access-Control-Allow-Origin'])
      .toBe('http://localhost:5173')
  })

  it('falls back to the first allowed origin for unknown origins', () => {
    const origins = ['https://www.vexr.app', 'http://localhost:5173']
    const headers = getCorsHeaders('https://evil.com', origins)
    expect(headers['Access-Control-Allow-Origin']).toBe('https://www.vexr.app')
  })

  it('does not echo a trailing-slash origin — stripped by parseAllowedOrigins', () => {
    const origins = parseAllowedOrigins('https://www.vexr.app/')
    // Browser sends origin WITHOUT trailing slash
    const headers = getCorsHeaders('https://www.vexr.app', origins)
    expect(headers['Access-Control-Allow-Origin']).toBe('https://www.vexr.app')
  })

  it('always includes Access-Control-Allow-Headers', () => {
    const headers = getCorsHeaders('https://www.vexr.app', ['https://www.vexr.app'])
    expect(headers['Access-Control-Allow-Headers']).toBe(ALLOW_HEADERS)
  })
})
