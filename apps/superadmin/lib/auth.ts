import { randomBytes } from "node:crypto"
import type { SuperAdminRole } from "@prisma/client"
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"

import {
  MAX_CONCURRENT_SESSIONS,
  SESSION_ABSOLUTE_SECONDS,
  SESSION_IDLE_SECONDS,
  authConfig,
} from "@/auth.config"
import { prisma } from "@/lib/db"
import { AUTH_ACTIONS, auditLog, auditTarget } from "@/lib/audit"
import { verifyChallenge, type ChallengePurpose } from "@/lib/auth-challenge"
import { consumeBackupCode, looksLikeBackupCode } from "@/lib/backup-codes"
import { decryptSecret } from "@/lib/crypto"
import { clientIp, isIpAllowedForUser } from "@/lib/ip"
import { clearFailures, lockState, registerFailure } from "@/lib/lockout"
import { isDeviceTrusted } from "@/lib/trusted-device"
import { verifyTotp } from "@/lib/totp"

// Sign-in is two-legged and the password leg NEVER mints a session:
//
//   leg 1  POST /api/auth/signin      email + password  → signed challenge cookie
//   leg 2  POST /api/auth/verify-mfa  challenge + factor → session
//
// Everything secret-checking happens inside authorize() below, so posting
// straight at /api/auth/callback/credentials gains an attacker nothing: the
// challenge is HMAC-signed and short-lived, and the second factor is verified
// against the database here rather than trusted from the caller.

type AuthorizedUser = {
  id: string
  email: string
  name: string
  role: SuperAdminRole
  sessionId: string
}

/** Accept either challenge flavour — enrolment finishes by signing in too. */
function readChallenge(token: string): { userId: string; purpose: ChallengePurpose } | null {
  return verifyChallenge(token, "mfa") ?? verifyChallenge(token, "enroll")
}

/**
 * Enforce the concurrent-session cap before adding one more.
 *
 * Oldest-by-activity is revoked first, so the tab someone is actually using
 * survives and the forgotten one on another machine does not.
 */
async function enforceConcurrencyLimit(userId: string, ipAddress: string): Promise<void> {
  const live = await prisma.superAdminSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastActiveAt: "asc" },
    select: { id: true, token: true },
  })

  const excess = live.length - (MAX_CONCURRENT_SESSIONS - 1)
  if (excess <= 0) return

  const doomed = live.slice(0, excess)
  await prisma.superAdminSession.updateMany({
    where: { id: { in: doomed.map((row) => row.id) } },
    data: { revokedAt: new Date(), revokedReason: "concurrent-limit" },
  })

  for (const row of doomed) {
    await auditLog({
      userId,
      action: AUTH_ACTIONS.SESSION_REVOKED,
      target: auditTarget("session", row.token.slice(0, 12)),
      targetType: "session",
      ipAddress,
      details: { reason: "concurrent-limit", limit: MAX_CONCURRENT_SESSIONS },
    })
  }
}

async function startSession(
  user: { id: string; email: string; name: string; role: SuperAdminRole },
  headers: Headers,
  factor: "totp" | "backup-code" | "trusted-device",
): Promise<AuthorizedUser> {
  const ipAddress = clientIp(headers)
  const userAgent = headers.get("user-agent")?.slice(0, 240) ?? "unknown"
  const token = randomBytes(32).toString("hex")
  const now = Date.now()

  await enforceConcurrencyLimit(user.id, ipAddress)

  await prisma.$transaction([
    prisma.superAdminSession.create({
      data: {
        userId: user.id,
        token,
        ipAddress,
        userAgent,
        expiresAt: new Date(now + SESSION_IDLE_SECONDS * 1000),
        absoluteExpiresAt: new Date(now + SESSION_ABSOLUTE_SECONDS * 1000),
        lastActiveAt: new Date(now),
      },
    }),
    prisma.superAdminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(now), lastLoginIP: ipAddress },
    }),
  ])

  await clearFailures(user.id)

  // The password leg already logged LOGIN_SUCCESS; this row records which
  // second factor satisfied the gate (trusted-device means it was skipped by
  // a prior explicit decision, which is worth seeing in the audit trail).
  await auditLog({
    userId: user.id,
    action: AUTH_ACTIONS.MFA_SUCCESS,
    target: auditTarget("user", user.id),
    targetType: "user",
    ipAddress,
    details: { factor, sessionRef: token.slice(0, 12) },
  })

  if (factor === "backup-code") {
    await auditLog({
      userId: user.id,
      action: AUTH_ACTIONS.BACKUP_CODE_USED,
      target: auditTarget("user", user.id),
      targetType: "user",
      ipAddress,
    })
  }

  return { ...user, sessionId: token }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { challenge: {}, otp: {}, deviceToken: {} },

      async authorize(credentials, request) {
        const challenge = typeof credentials?.challenge === "string" ? credentials.challenge : ""
        const otp = typeof credentials?.otp === "string" ? credentials.otp.trim() : ""
        const deviceToken =
          typeof credentials?.deviceToken === "string" ? credentials.deviceToken : ""

        const headers = request?.headers ?? new Headers()
        const ipAddress = clientIp(headers)

        const verified = challenge ? readChallenge(challenge) : null
        if (!verified) return null

        const user = await prisma.superAdminUser.findUnique({ where: { id: verified.userId } })
        if (!user || !user.isActive) return null

        // Re-check everything the password leg checked: the challenge is five
        // minutes long, and an account can be locked or moved off-network
        // inside that window.
        if (lockState(user).locked) return null

        if (!(await isIpAllowedForUser(user.id, ipAddress))) {
          await auditLog({
            userId: user.id,
            action: AUTH_ACTIONS.IP_BLOCKED,
            target: auditTarget("user", user.id),
            targetType: "user",
            ipAddress,
            details: { stage: "mfa" },
          })
          return null
        }

        if (!user.totpEnabled) return null

        const identity = {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }

        // ── Factor 1: a device this user previously chose to trust ──
        if (deviceToken && (await isDeviceTrusted(user.id, deviceToken))) {
          return startSession(identity, headers, "trusted-device")
        }

        if (!otp) return null

        // ── Factor 2: a one-time backup code ──
        if (looksLikeBackupCode(otp)) {
          if (await consumeBackupCode(user.id, otp)) {
            return startSession(identity, headers, "backup-code")
          }

          await registerFailure(user.id, "backup-code", ipAddress)
          await auditLog({
            userId: user.id,
            action: AUTH_ACTIONS.MFA_FAILED,
            target: auditTarget("user", user.id),
            targetType: "user",
            ipAddress,
            details: { factor: "backup-code" },
          })
          return null
        }

        // ── Factor 3: the authenticator app ──
        const secret = decryptSecret(user.totpSecret)
        if (!secret || !verifyTotp(user.email, secret, otp)) {
          await registerFailure(user.id, "totp", ipAddress)
          await auditLog({
            userId: user.id,
            action: AUTH_ACTIONS.MFA_FAILED,
            target: auditTarget("user", user.id),
            targetType: "user",
            ipAddress,
            details: { factor: "totp", reason: secret ? "bad-code" : "no-secret" },
          })
          return null
        }

        return startSession(identity, headers, "totp")
      },
    }),
  ],
})

/** Password hash for seeding and for the user-management screens. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}
