import { isRecord, type ValidationResult } from './validation.ts'

// Deno-global-free request-body validation for parse-plan, extracted so it's
// importable directly by Vitest (like cors.ts) instead of left untested — this
// is the network trust boundary before untrusted content reaches the Claude
// prompt, so a gap here is a real risk, not just a coverage nit.

export const VALID_CONTENT_TYPES = ['pdf', 'html', 'text'] as const

export interface ParsePlanRequest {
  content: string
  contentType: string
  startDate?: string
  raceDate?: string
  planName?: string
}

export function validateParsePlanRequest(body: unknown): ValidationResult<ParsePlanRequest> {
  if (!isRecord(body)) return { ok: false, error: 'Missing content' }
  if (typeof body.content !== 'string') return { ok: false, error: 'Missing content' }
  if (typeof body.contentType !== 'string') return { ok: false, error: 'Missing content' }

  const content = body.content
  const contentType = body.contentType
  const startDate = typeof body.startDate === 'string' ? body.startDate : undefined
  const raceDate = typeof body.raceDate === 'string' ? body.raceDate : undefined
  const planName = typeof body.planName === 'string' ? body.planName : undefined

  if (!content) return { ok: false, error: 'Missing content' }
  if (content.length > 80000) return { ok: false, error: 'content_too_large' }
  if (!(VALID_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    return { ok: false, error: 'Invalid content type' }
  }
  if (startDate && isNaN(Date.parse(startDate))) return { ok: false, error: 'Invalid start date format' }
  if (raceDate && isNaN(Date.parse(raceDate))) return { ok: false, error: 'Invalid race date format' }

  return { ok: true, value: { content, contentType, startDate, raceDate, planName } }
}
