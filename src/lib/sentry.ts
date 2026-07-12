import * as Sentry from '@sentry/react'

// No-op unless VITE_SENTRY_DSN is set — a Sentry account is optional, not required to run the
// app (local dev, forks, self-hosters). See docs/ENVIRONMENT.md.
const dsn = import.meta.env.VITE_SENTRY_DSN

export function initSentry() {
  if (!dsn) return
  Sentry.init({ dsn, tracesSampleRate: 0 })
}

// Called from ErrorBoundary — the one place in the app that already catches every otherwise-
// unhandled render error, so this is the single wiring point rather than scattering
// Sentry.captureException calls through individual catch blocks.
export function captureError(error: unknown, extra?: Record<string, unknown>) {
  if (!dsn) return
  Sentry.captureException(error, extra ? { extra } : undefined)
}
