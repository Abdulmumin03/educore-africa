import * as Sentry from "@sentry/nextjs"

/**
 * Server-side Sentry init. Loaded automatically by `@sentry/nextjs` when the
 * Node runtime starts. No-ops when SENTRY_DSN is unset so dev works without
 * any Sentry account.
 */
const dsn = process.env.SENTRY_DSN

Sentry.init({
  dsn,
  enabled: !!dsn,
  // 10% transaction sampling in prod — bump for staging if needed.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  // Strip request bodies from breadcrumbs by default; opt in per-route when
  // you actually need the payload to debug.
  sendDefaultPii: false,
  environment: process.env.NODE_ENV ?? "development",
  release: process.env.APP_VERSION,
})
