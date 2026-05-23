import * as Sentry from "@sentry/nextjs"

/**
 * Attach the current user + school to Sentry scope so server errors carry
 * useful context. Call from route handlers right after `auth()`.
 *
 *   const session = await auth()
 *   if (session?.user) attachSentryUser(session.user)
 *
 * No-op when Sentry isn't configured.
 */
export function attachSentryUser(user: {
  id: string
  email?: string | null
  schoolId?: string | null
  role?: string
}) {
  if (!process.env.SENTRY_DSN) return
  Sentry.setUser({
    id: user.id,
    email: user.email ?? undefined,
  })
  Sentry.setTag("role", user.role ?? "unknown")
  if (user.schoolId) Sentry.setTag("school_id", user.schoolId)
}

/** Capture an exception with a free-form tag for grepability in Sentry UI. */
export function captureWithTag(
  err: unknown,
  tag: string,
  metadata?: Record<string, unknown>,
) {
  if (!process.env.SENTRY_DSN) {
    console.error(`[sentry-stub:${tag}]`, err, metadata)
    return
  }
  Sentry.withScope((scope) => {
    scope.setTag("source", tag)
    if (metadata) scope.setContext("metadata", metadata)
    Sentry.captureException(err)
  })
}
