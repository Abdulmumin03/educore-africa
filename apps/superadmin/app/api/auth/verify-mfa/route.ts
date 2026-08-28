import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { AUTH_ACTIONS, auditLog, auditTarget } from "@/lib/audit"
import { MFA_COOKIE, verifyChallenge } from "@/lib/auth-challenge"
import { completeSignIn } from "@/lib/auth-flow"
import { guardAuthRate } from "@/lib/rate-guard"
import { clientIp } from "@/lib/ip"
import { lockState, lockoutMessage } from "@/lib/lockout"
import {
  TRUSTED_DEVICE_COOKIE,
  trustDevice,
  trustedDeviceCookieOptions,
} from "@/lib/trusted-device"

export const dynamic = "force-dynamic"

// Leg 2: the second factor. Accepts a 6-digit authenticator code or a backup
// code — lib/auth's authorize() decides which and does the verification.
//
// The challenge is NOT burned on a wrong code: the 5-strikes lockout is what
// throttles guessing, and burning it would force a full password re-entry
// after a single mistyped digit.

export async function POST(request: Request) {
  // Before any database work: an unlimited guess rate is the thing this
  // endpoint most needs protecting from.
  const rate = await guardAuthRate(request)
  if (!rate.ok) return rate.response

  const ipAddress = clientIp(request.headers)
  const jar = cookies()
  const challenge = jar.get(MFA_COOKIE)?.value

  const verified = challenge ? verifyChallenge(challenge, "mfa") : null
  if (!challenge || !verified) {
    return NextResponse.json(
      { error: "That sign-in attempt expired. Start again.", next: "/login" },
      { status: 401 },
    )
  }

  let body: { otp?: unknown; trustDevice?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const otp = typeof body.otp === "string" ? body.otp.trim() : ""
  const shouldTrust = body.trustDevice === true

  if (!otp) {
    return NextResponse.json({ error: "Enter the code from your authenticator." }, { status: 400 })
  }

  const signedIn = await completeSignIn({ challenge, otp })

  if (!signedIn) {
    // authorize() already registered the failure and wrote MFA_FAILED; read
    // the resulting state so the UI can show what is left.
    const user = await prisma.superAdminUser.findUnique({
      where: { id: verified.userId },
      select: { failedLoginAttempts: true, lockedUntil: true },
    })
    const state = user ? lockState(user) : { locked: false, until: null, remaining: 0 }

    if (state.locked) {
      jar.delete(MFA_COOKIE)
      return NextResponse.json(
        { error: lockoutMessage(state.until), lockedUntil: state.until, next: "/login" },
        { status: 423 },
      )
    }

    return NextResponse.json(
      { error: "That code was not accepted.", attemptsRemaining: state.remaining },
      { status: 401 },
    )
  }

  jar.delete(MFA_COOKIE)

  if (shouldTrust) {
    const { token, maxAgeSeconds } = await trustDevice({
      userId: verified.userId,
      ipAddress,
      userAgent: request.headers.get("user-agent"),
    })
    jar.set(TRUSTED_DEVICE_COOKIE, token, trustedDeviceCookieOptions(maxAgeSeconds))

    await auditLog({
      userId: verified.userId,
      action: AUTH_ACTIONS.DEVICE_TRUSTED,
      target: auditTarget("user", verified.userId),
      targetType: "user",
      ipAddress,
    })
  }

  return NextResponse.json({ next: "/console" })
}
