export function parseAllowedOrigins(envValue: string | undefined): string[] {
  if (!envValue) return []
  return [
    ...envValue.split(',').map(s => s.trim().replace(/\/$/, '')),
    'http://localhost:5173',
    'http://localhost:3000',
  ]
}

export function getCorsHeaders(origin: string, allowedOrigins: string[]): Record<string, string> {
  const allowed = allowedOrigins.length === 0
    ? '*'
    : (allowedOrigins.includes(origin) ? origin : allowedOrigins[0])
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}
