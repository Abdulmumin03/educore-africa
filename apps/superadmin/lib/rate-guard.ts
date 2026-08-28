import { NextResponse } from "next/server"

import { clientIp } from "@/lib/ip"
import { RULES, checkRate, rateHeaders } from "@/lib/rate-limit"

// Where rate limiting is actually enforced.
//
// It CANNOT live in middleware: that runs on the edge runtime, where ioredis
// does not exist — the same constraint that already pushes the per-user IP
// allowlist into lib/session-guard. So the auth surface is limited here, at
// the top of every route that accepts a secret, and general API traffic is
// limited inside requireApiSession.

/**
 * Per-IP limiter for the credential-guessing surface: sign-in, MFA
 * verification and TOTP confirmation.
 *
 * Unlike the general API limiter this FAILS CLOSED when Redis is unreachable.
 * A console that keeps accepting unlimited password attempts because a cache
 * blipped has lost the only thing standing between an attacker and an
 * unlimited guess rate; locking sign-in for the length of an outage is the
 * cheaper failure.
 */
export async function guardAuthRate(
  request: Request,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const ip = clientIp(request.headers)

  // Loopback is exempt OUTSIDE production only. A developer signing in and
  // out, and the smoke suites which authenticate a handful of accounts in a
  // row, both blow through ten attempts a minute from 127.0.0.1 — and a
  // limiter that makes the test suite unrunnable gets turned off wholesale,
  // which is worse than one narrow carve-out. In production every request
  // arrives through Cloudflare with a real client IP, so this never fires;
  // the guard is checked by the SA-10 suite from a routable address.
  if (process.env.NODE_ENV !== "production" && (ip === "127.0.0.1" || ip === "::1")) {
    return { ok: true }
  }

  const verdict = await checkRate(`auth:${ip}`, RULES.auth)

  if (verdict.degraded) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Sign-in is temporarily unavailable — the rate limiter cannot reach its store. Try again shortly.",
        },
        { status: 503, headers: { "Retry-After": "30" } },
      ),
    }
  }

  if (!verdict.allowed) {
    const retryAfter = Math.max(1, Math.ceil((verdict.resetAt - Date.now()) / 1000))
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Too many attempts from this address. Wait ${retryAfter} seconds and try again.`,
        },
        {
          status: 429,
          headers: { ...rateHeaders(verdict), "Retry-After": String(retryAfter) },
        },
      ),
    }
  }

  return { ok: true }
}
