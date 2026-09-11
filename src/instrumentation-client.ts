import * as Sentry from '@sentry/nextjs'

// Dormant by design: with no NEXT_PUBLIC_SENTRY_DSN the SDK is never
// initialized and this module is inert.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Error monitoring only — no performance tracing or session replays.
    tracesSampleRate: 0,
    sendDefaultPii: false,
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
