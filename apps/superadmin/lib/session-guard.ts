import { NextResponse } from "next/server"
import type { SuperAdminRole } from "@prisma/client"

import { SESSION_COOKIE, SESSION_IDLE_SECONDS } from "@/auth.config"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { AUTH_ACTIONS, auditLog, auditTarget } from "@/lib/audit"
import { isIpAllowedForUser } from "@/lib/ip"
import { recordSample } from "@/lib/api-metrics"
import { recordCall, recordError } from "@/lib/api-errors"
import { RULES, checkRate, rateHeaders } from "@/lib/rate-limit"

export type ConsoleUser = {
  id: string
  name: string
  email: string
  role: SuperAdminRole
  sessionId: string
}

export type SessionFailure =
  | "no-session"
  | "revoked"
  | "idle-expired"
  | "absolute-expired"
  | "inactive-user"
  | "ip-blocked"

export type SessionResult =
  | { ok: true; user: ConsoleUser }
  | { ok: false; reason: SessionFailure }

// A signed JWT alone is not enough to be "logged in". Every request also
// proves that:
//   - the SuperAdminSession row still exists and is not revoked
//   - the 30-minute idle window has not lapsed
//   - the 8-hour absolute ceiling has not been hit
//   - the account is still active
//   - the caller is still on an allowed IP  ← the per-user half of the
//     allowlist, which middleware cannot do (edge runtime, no DB access)
//
// On success the idle window slides forward.

// Writing lastActiveAt on literally every request would mean a row update per
// page asset. One write per minute is enough resolution for a 30-minute window.
const SLIDE_THROTTLE_MS = 60_000

export async function validateSession(ipAddress: string): Promise<SessionResult> {
  const session = await auth()
  const sessionId = session?.user?.sessionId

  if (!sessionId) return { ok: false, reason: "no-session" }

  const row = await prisma.superAdminSession.findUnique({
    where: { token: sessionId },
    include: { user: true },
  })

  if (!row) return { ok: false, reason: "no-session" }
  if (row.revokedAt) return { ok: false, reason: "revoked" }

  const now = new Date()

  if (row.absoluteExpiresAt <= now || row.expiresAt <= now) {
    const reason = row.absoluteExpiresAt <= now ? "absolute-expired" : "idle-expired"

    // Mark it revoked so the next request short-circuits above and we log
    // SESSION_EXPIRED exactly once.
    await prisma.superAdminSession.update({
      where: { id: row.id },
      data: { revokedAt: now, revokedReason: reason },
    })
    await auditLog({
      userId: row.userId,
      action: AUTH_ACTIONS.SESSION_EXPIRED,
      target: auditTarget("session", row.token.slice(0, 12)),
      targetType: "session",
      ipAddress,
      details: { reason },
    })

    return { ok: false, reason }
  }

  if (!row.user.isActive) return { ok: false, reason: "inactive-user" }

  if (!(await isIpAllowedForUser(row.userId, ipAddress))) {
    await auditLog({
      userId: row.userId,
      action: AUTH_ACTIONS.IP_BLOCKED,
      target: auditTarget("user", row.userId),
      targetType: "user",
      ipAddress,
      details: { stage: "session" },
    })
    return { ok: false, reason: "ip-blocked" }
  }

  if (now.getTime() - row.lastActiveAt.getTime() > SLIDE_THROTTLE_MS) {
    await prisma.superAdminSession.update({
      where: { id: row.id },
      data: {
        lastActiveAt: now,
        expiresAt: new Date(now.getTime() + SESSION_IDLE_SECONDS * 1000),
      },
    })
  }

  return {
    ok: true,
    user: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      role: row.user.role,
      sessionId: row.token,
    },
  }
}

const MESSAGES: Record<SessionFailure, string> = {
  "no-session": "Not signed in",
  revoked: "Session revoked",
  "idle-expired": "Session expired after 30 minutes of inactivity",
  "absolute-expired": "Session reached its 8-hour limit",
  "inactive-user": "Account is deactivated",
  "ip-blocked": "Access denied: IP not allowed",
}

/** 401 (403 for a blocked IP) with the session cookie cleared. */
export function unauthorized(reason: SessionFailure): NextResponse {
  const response = NextResponse.json(
    { error: MESSAGES[reason], reason },
    { status: reason === "ip-blocked" ? 403 : 401 },
  )

  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  })

  return response
}

/**
 * Guard for route handlers.
 *
 *   const guard = await requireApiSession(request)
 *   if (!guard.ok) return guard.response
 *   guard.user   // ConsoleUser
 */
export async function requireApiSession(
  request: Request,
): Promise<{ ok: true; user: ConsoleUser; ipAddress: string } | { ok: false; response: NextResponse }> {
  const startedAt = performance.now()
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"

  const result = await validateSession(ipAddress)

  // Telemetry for the API Performance tab. This times the guard, which every
  // route shares — not the handler's own work — so it is a floor on latency
  // rather than the whole story, and the tab says so. Fire-and-forget: a slow
  // or dead Redis must never delay the request.
  let pathname = "unknown"
  try {
    pathname = new URL(request.url).pathname
  } catch {
    // Keep the fallback.
  }
  const status = result.ok ? 200 : result.reason === "ip-blocked" ? 403 : 401
  void recordSample(pathname, performance.now() - startedAt, status)

  if (!result.ok) {
    // AWAITED, unlike the success path. A rejected request returns
    // immediately, and a fire-and-forget write is torn down with it — the
    // rejections would never reach the monitor that exists to show them. One
    // Redis round-trip on a request that is failing anyway costs nothing.
    await Promise.all([
      recordCall(pathname),
      recordError({
        pathname,
        method: request.method,
        status,
        message: MESSAGES[result.reason],
      }),
    ])
    return { ok: false, response: unauthorized(result.reason) }
  }

  // On the success path the handler keeps running, so the write has time to
  // flush without holding the response.
  void recordCall(pathname)

  // Per-user API budget. Keyed on the account rather than the IP because the
  // whole team shares one office address, and one person's runaway script
  // should not lock out the others.
  //
  // FAILS OPEN, unlike the auth limiter: if Redis is unreachable, refusing
  // every console request would turn a cache outage into a full outage, and
  // there is no credential to protect here — the caller is already signed in.
  const budget = await checkRate(`api:${result.user.id}`, RULES.api)
  if (!budget.allowed) {
    const retryAfter = Math.max(1, Math.ceil((budget.resetAt - Date.now()) / 1000))
    void recordError({
      pathname,
      method: request.method,
      status: 429,
      message: "Rate limit exceeded",
    })
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Rate limit reached. Wait ${retryAfter} seconds.`, reason: "rate-limited" },
        { status: 429, headers: { ...rateHeaders(budget), "Retry-After": String(retryAfter) } },
      ),
    }
  }

  return { ok: true, user: result.user, ipAddress }
}

/** Role gate for route handlers. SUPER_ADMIN passes everything. */
export function requireApiRole(
  user: ConsoleUser,
  ...roles: SuperAdminRole[]
): NextResponse | null {
  if (user.role === "SUPER_ADMIN" || roles.includes(user.role)) return null
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}
