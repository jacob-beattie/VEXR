// Tiny shared building blocks for request-body validation, used by the
// per-function validators in parsePlanValidation.ts / generatePlanValidation.ts.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }
