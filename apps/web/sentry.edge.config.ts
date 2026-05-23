import * as Sentry from "@sentry/nextjs"

// Edge runtime config — minimal because most app routes run in Node.
const dsn = process.env.SENTRY_DSN

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  environment: process.env.NODE_ENV ?? "development",
  release: process.env.APP_VERSION,
})
