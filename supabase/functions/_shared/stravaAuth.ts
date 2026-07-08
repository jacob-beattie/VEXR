// Deno-global-free helpers extracted from strava-auth so they're importable
// directly by Vitest (like cors.ts) instead of left untested.

/** Narrows the raw request body to the Strava OAuth `code` field, or null if missing/malformed. */
export function extractAuthCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const code = (body as Record<string, unknown>).code
  return typeof code === 'string' && code.length > 0 ? code : null
}

interface StravaAthlete {
  firstname?: string | null
  lastname?: string | null
}

/** Builds the display name stored alongside a Strava connection from the token-exchange response. */
export function buildAthleteName(athlete: StravaAthlete | null | undefined): string | null {
  if (!athlete) return null
  return [athlete.firstname, athlete.lastname].filter(Boolean).join(' ') || null
}
