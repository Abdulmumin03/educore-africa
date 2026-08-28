import { redis } from "@/lib/redis"

// Sliding-window rate limiting.
//
// A fixed window lets somebody spend a full quota at 10:00:59 and another at
// 10:01:00 — twice the limit inside two seconds, which is exactly the burst a
// credential-stuffing script produces. This keeps a sorted set of request
// timestamps per key and counts what is still inside the window, so the limit
// holds at every instant rather than only at the boundary.
//
// The whole check is one Redis round trip. Redis being down FAILS OPEN for
// ordinary API traffic (locking every operator out of the console because a
// cache blipped is worse than the burst) but the auth limiter is stricter —
// see the caller in middleware.

export type Rule = {
  /** Requests allowed inside the window. */
  limit: number
  windowSeconds: number
}

export const RULES = {
  /** Sign-in, MFA, TOTP. Tight: this is the credential-guessing surface. */
  auth: { limit: 10, windowSeconds: 60 } satisfies Rule,
  /** Everything else under /api, per authenticated session. */
  api: { limit: 200, windowSeconds: 60 } satisfies Rule,
} as const

export type RateVerdict = {
  allowed: boolean
  limit: number
  remaining: number
  /** Unix ms when the oldest request in the window falls out. */
  resetAt: number
  /** True when the check could not run — the caller decides what that means. */
  degraded: boolean
}

export async function checkRate(key: string, rule: Rule): Promise<RateVerdict> {
  const now = Date.now()
  const windowMs = rule.windowSeconds * 1000
  const cutoff = now - windowMs
  const redisKey = `rl:${key}`
  // Two requests inside the same millisecond would collide on score alone.
  const member = `${now}-${Math.random().toString(36).slice(2, 10)}`

  try {
    const [, , countResult] = (await redis
      .multi()
      // Drop everything older than the window before counting it.
      .zremrangebyscore(redisKey, 0, cutoff)
      .zadd(redisKey, now, member)
      .zcard(redisKey)
      .expire(redisKey, rule.windowSeconds + 1)
      .exec()) as Array<[Error | null, unknown]>

    const count = Number(countResult?.[1] ?? 0)
    const allowed = count <= rule.limit

    if (!allowed) {
      // The rejected request must not count against the next window, or a
      // client that keeps retrying can never recover.
      await redis.zrem(redisKey, member)
    }

    return {
      allowed,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - count),
      resetAt: now + windowMs,
      degraded: false,
    }
  } catch {
    return {
      allowed: true,
      limit: rule.limit,
      remaining: rule.limit,
      resetAt: now + windowMs,
      degraded: true,
    }
  }
}

/** Standard headers so a client can back off without guessing. */
export function rateHeaders(verdict: RateVerdict): Record<string, string> {
  return {
    "RateLimit-Limit": String(verdict.limit),
    "RateLimit-Remaining": String(verdict.remaining),
    "RateLimit-Reset": String(Math.ceil((verdict.resetAt - Date.now()) / 1000)),
  }
}
