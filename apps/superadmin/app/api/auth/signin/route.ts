import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"

import { prisma } from "@/lib/db"
import { AUTH_ACTIONS, auditLog, auditTarget } from "@/lib/audit"
import { MFA_COOKIE, challengeCookieOptions, signChallenge } from "@/lib/auth-challenge"
import { completeSignIn } from "@/lib/auth-flow"
import { guardAuthRate } from "@/lib/rate-guard"
import { clientIp, isIpAllowedForUser } from "@/lib/ip"
import { lockState, lockoutMessage, registerFailure } from "@/lib/lockout"
import { TRUSTED_DEVICE_COOKIE } from "@/lib/trusted-device"

export const dynamic = "force-dynamic"

// Leg 1 of sign-in: password only. This NEVER mints a session — success just
// hands back a five-minute signed challenge cookie and tells the client where
// to go next (/mfa, or /enroll-mfa for an account that has not set up TOTP).
// The one exception is a device the user previously chose to trust, which
// satisfies the second factor and completes here.

// Deliberately identical for "no such account", "wrong password" and
// "deactivated" — the login form must not confirm which emails exist.
const GENERIC = "Those credentials were not accepted."

export async function POST(request: Request) {
  // Before any database work: an unlimited guess rate is the thing this
  // endpoint most needs protecting from.
  const rate = await guardAuthRate(request)
  if (!rate.ok) return rate.response

  const ipAddress = clientIp(request.headers)

  let body: { email?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body.password === "string" ? body.password : ""

  if (!email || !password) {
    return NextResponse.json({ error: "Enter your email address and password." }, { status: 400 })
  }

  const user = await prisma.superAdminUser.findUnique({ where: { email } })

  if (!user || !user.isActive) {
    await auditLog({
      userId: user?.id ?? null,
      action: AUTH_ACTIONS.LOGIN_FAILED,
      target: `email:${email}`,
      targetType: "user",
      ipAddress,
      details: { reason: user ? "inactive" : "unknown-email" },
    })
    return NextResponse.json({ error: GENERIC }, { status: 401 })
  }

  const lock = lockState(user)
  if (lock.locked) {
    await auditLog({
      userId: user.id,
      action: AUTH_ACTIONS.LOGIN_FAILED,
      target: auditTarget("user", user.id),
      targetType: "user",
      ipAddress,
      details: { reason: "locked-out", until: lock.until?.toISOString() },
    })
    return NextResponse.json(
      { error: lockoutMessage(lock.until), lockedUntil: lock.until },
      { status: 423 },
    )
  }

  if (!(await isIpAllowedForUser(user.id, ipAddress))) {
    await auditLog({
      userId: user.id,
      action: AUTH_ACTIONS.IP_BLOCKED,
      target: auditTarget("user", user.id),
      targetType: "user",
      ipAddress,
      details: { stage: "password" },
    })
    return NextResponse.json({ error: "Access denied: IP not allowed" }, { status: 403 })
  }

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    const state = await registerFailure(user.id, "password", ipAddress)
    await auditLog({
      userId: user.id,
      action: AUTH_ACTIONS.LOGIN_FAILED,
      target: auditTarget("user", user.id),
      targetType: "user",
      ipAddress,
      details: { reason: "bad-password", attemptsRemaining: state.remaining },
    })

    return state.locked
      ? NextResponse.json(
          { error: lockoutMessage(state.until), lockedUntil: state.until },
          { status: 423 },
        )
      : NextResponse.json({ error: GENERIC, attemptsRemaining: state.remaining }, { status: 401 })
  }

  await auditLog({
    userId: user.id,
    action: AUTH_ACTIONS.LOGIN_SUCCESS,
    target: auditTarget("user", user.id),
    targetType: "user",
    ipAddress,
    details: { stage: "password" },
  })

  const jar = cookies()

  // No TOTP yet — the account cannot reach the console until it enrols.
  if (!user.totpEnabled) {
    jar.set(MFA_COOKIE, signChallenge(user.id, "enroll"), challengeCookieOptions())
    return NextResponse.json({ next: "/enroll-mfa", enrollmentRequired: true })
  }

  const challenge = signChallenge(user.id, "mfa")

  // A device the user explicitly trusted stands in for the code.
  const deviceToken = jar.get(TRUSTED_DEVICE_COOKIE)?.value
  if (deviceToken && (await completeSignIn({ challenge, deviceToken }))) {
    jar.delete(MFA_COOKIE)
    return NextResponse.json({ next: "/console", trustedDevice: true })
  }

  jar.set(MFA_COOKIE, challenge, challengeCookieOptions())
  return NextResponse.json({ next: "/mfa", mfaRequired: true })
}
