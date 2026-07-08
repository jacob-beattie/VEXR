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

  it('does not append localhost entries — localhost is matched by pattern in isOriginAllowed instead', () => {
    const result = parseAllowedOrigins('https://www.vexr.app')
    expect(result).not.toContain('http://localhost:5173')
    expect(result).not.toContain('http://localhost:3000')
  })
})

describe('getCorsHeaders', () => {
  const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type'

  it('allows localhost even when allowedOrigins is empty (unset secret, local dev)', () => {
    const headers = getCorsHeaders('http://localhost:5173', [])
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
    expect(headers['Access-Control-Allow-Headers']).toBe(ALLOW_HEADERS)
  })

  it('fails closed (omits the header) for a non-localhost origin when allowedOrigins is empty', () => {
    const headers = getCorsHeaders('https://www.vexr.app', [])
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(headers['Access-Control-Allow-Headers']).toBe(ALLOW_HEADERS)
  })

  it('echoes the exact origin when it is in the allowlist', () => {
    const origins = ['https://www.vexr.app', 'http://localhost:5173']
    expect(getCorsHeaders('https://www.vexr.app', origins)['Access-Control-Allow-Origin'])
      .toBe('https://www.vexr.app')
    expect(getCorsHeaders('http://localhost:5173', origins)['Access-Control-Allow-Origin'])
      .toBe('http://localhost:5173')
  })

  it('fails closed (omits the header) for an unknown origin, rather than falling back to an allowed one', () => {
    const origins = ['https://www.vexr.app', 'http://localhost:5173']
    const headers = getCorsHeaders('https://evil.com', origins)
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined()
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

  it('allows any localhost/127.0.0.1 port, not just the hardcoded 5173/3000 — Vite bumps ports when one is taken', () => {
    expect(getCorsHeaders('http://localhost:5174', [])['Access-Control-Allow-Origin']).toBe('http://localhost:5174')
    expect(getCorsHeaders('http://localhost:4000', [])['Access-Control-Allow-Origin']).toBe('http://localhost:4000')
    expect(getCorsHeaders('http://127.0.0.1:5173', [])['Access-Control-Allow-Origin']).toBe('http://127.0.0.1:5173')
  })

  it('still fails closed for a non-loopback host even with a port', () => {
    const headers = getCorsHeaders('http://evil.com:5173', [])
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined()
  })
})
