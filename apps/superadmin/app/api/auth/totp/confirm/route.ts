import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { guardAuthRate } from "@/lib/rate-guard"
import { AUTH_ACTIONS, auditLog, auditTarget } from "@/lib/audit"
import { MFA_COOKIE } from "@/lib/auth-challenge"
import { completeSignIn } from "@/lib/auth-flow"
import { issueBackupCodes } from "@/lib/backup-codes"
import { encryptSecret } from "@/lib/crypto"
import { resolveEnrolmentContext } from "@/lib/enrolment-context"
import { forgetAllDevices } from "@/lib/trusted-device"
import { verifyTotp } from "@/lib/totp"
import { clearPendingSecret, readPendingSecret } from "@/lib/totp-enrolment"
import { cookies } from "next/headers"

export const dynamic = "force-dynamic"

// Step 2: the code from the authenticator proves the secret was scanned, so
// now it is safe to persist. Confirming also invalidates every previously
// trusted device — the second factor just changed, so old trust decisions
// were made about a different credential.
export async function POST(request: Request) {
  // Before any database work: an unlimited guess rate is the thing this
  // endpoint most needs protecting from.
  const rate = await guardAuthRate(request)
  if (!rate.ok) return rate.response

  const context = await resolveEnrolmentContext(request.headers)
  if (!context) {
    return NextResponse.json({ error: "Not signed in", next: "/login" }, { status: 401 })
  }

  let body: { code?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const code = typeof body.code === "string" ? body.code.trim() : ""
  const secret = readPendingSecret(context.userId)

  if (!secret) {
    return NextResponse.json(
      { error: "Enrolment expired. Generate a new QR code." },
      { status: 409 },
    )
  }

  if (!verifyTotp(context.email, secret, code)) {
    await auditLog({
      userId: context.userId,
      action: AUTH_ACTIONS.MFA_FAILED,
      target: auditTarget("user", context.userId),
      targetType: "user",
      ipAddress: context.ipAddress,
      details: { factor: "totp", stage: "enrolment" },
    })
    return NextResponse.json({ error: "That code was not accepted." }, { status: 401 })
  }

  await prisma.superAdminUser.update({
    where: { id: context.userId },
    data: {
      totpSecret: encryptSecret(secret),
      totpEnabled: true,
      totpConfirmedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  })

  await forgetAllDevices(context.userId)
  const backupCodes = await issueBackupCodes(context.userId)
  clearPendingSecret()

  await auditLog({
    userId: context.userId,
    action: AUTH_ACTIONS.MFA_ENROLLED,
    target: auditTarget("user", context.userId),
    targetType: "user",
    ipAddress: context.ipAddress,
    details: { forced: context.forced },
  })

  // Forced enrolment: the user has just proven both factors, so hand them a
  // session rather than bouncing them back to the login form.
  if (context.forced && context.challenge) {
    const signedIn = await completeSignIn({ challenge: context.challenge, otp: code })
    cookies().delete(MFA_COOKIE)

    return NextResponse.json({
      ok: true,
      backupCodes,
      next: signedIn ? "/console" : "/login",
    })
  }

  return NextResponse.json({ ok: true, backupCodes, next: "/console/settings/security/totp" })
}
