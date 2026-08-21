import * as Sentry from 'https://esm.sh/@sentry/deno@10.65.0'

// No-op unless the SENTRY_DSN secret is set — a Sentry account is optional, not required to
// deploy/run these functions. See docs/ENVIRONMENT.md.
const dsn = Deno.env.get('SENTRY_DSN')
let initialized = false

function ensureInit() {
  if (initialized || !dsn) return
  Sentry.init({ dsn, tracesSampleRate: 0 })
  initialized = true
}

// Called from each function's catch block, right after the existing console.error(...) line
// (which already includes requestId + userId — see e.g. ai-briefing/index.ts). Never throws: a
// broken error reporter must not mask the original error already being returned to the caller.
export function captureError(
  err: unknown,
  context: { requestId: string; userId: string | null; function: string },
) {
  if (!dsn) return
  try {
    ensureInit()
    Sentry.withScope((scope) => {
      scope.setTag('function', context.function)
      scope.setTag('requestId', context.requestId)
      if (context.userId) scope.setUser({ id: context.userId })
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)))
    })
  } catch (captureErr) {
    console.error('[error-tracking] failed to report to Sentry:', captureErr)
  }
}
