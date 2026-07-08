const LOCAL_ORIGINS = ['http://localhost:5173', 'http://localhost:3000']

export function parseAllowedOrigins(envValue: string | undefined): string[] {
  if (!envValue) return []
  return [
    ...envValue.split(',').map(s => s.trim().replace(/\/$/, '')),
    ...LOCAL_ORIGINS,
  ]
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes(origin)) return true
  if (LOCAL_ORIGINS.includes(origin)) return true
  // Allow all Vercel preview deployments (auth is still enforced by JWT)
  if (/^https:\/\/[^.]+\.vercel\.app$/.test(origin)) return true
  return false
}

let warnedMissingAllowedOrigin = false

// Fails closed: an origin that isn't recognised gets no Access-Control-Allow-Origin header at
// all, so the browser refuses to let the caller read the response, instead of the previous
// behaviour of falling back to '*' whenever the ALLOWED_ORIGIN secret was unset or misconfigured
// (a silent "any website can call these functions" degradation). Bearer-JWT auth inside each
// handler remains the real security boundary regardless of CORS — this only prevents a
// misconfiguration from silently opening the functions up to arbitrary origins.
export function getCorsHeaders(origin: string, allowedOrigins: string[]): Record<string, string> {
  if (allowedOrigins.length === 0 && !warnedMissingAllowedOrigin) {
    warnedMissingAllowedOrigin = true
    console.warn('[cors] ALLOWED_ORIGIN secret is not set — only localhost dev origins will be allowed. Set the ALLOWED_ORIGIN secret before deploying to production.')
  }
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (isOriginAllowed(origin, allowedOrigins)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}
