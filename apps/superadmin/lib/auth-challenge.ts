import { createHmac, timingSafeEqual } from "node:crypto"

// The password check and the TOTP check are separate HTTP requests, so step 1
// hands the browser a short-lived signed token instead of keeping the
// password around. Signed with SUPERADMIN_SECRET; useless without it.
//
// `purpose` stops an enrolment challenge being replayed at the MFA gate: a
// user with no TOTP secret yet must not be able to reuse that token to sign
// in as if they had passed a code.

const TTL_MS = 5 * 60 * 1000

export type ChallengePurpose = "mfa" | "enroll"

export const MFA_COOKIE = "educore-sa.mfa-challenge"

function secret(): string {
  const value = process.env.SUPERADMIN_SECRET
  if (!value) throw new Error("SUPERADMIN_SECRET is not set")
  return value
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest())
}

export function signChallenge(userId: string, purpose: ChallengePurpose): string {
  const payload = b64url(JSON.stringify({ sub: userId, pur: purpose, exp: Date.now() + TTL_MS }))
  return `${payload}.${sign(payload)}`
}

export type VerifiedChallenge = { userId: string; purpose: ChallengePurpose }

/** Returns null when the token is malformed, forged, stale, or the wrong purpose. */
export function verifyChallenge(
  token: string | undefined | null,
  expected: ChallengePurpose,
): VerifiedChallenge | null {
  if (!token) return null

  const [payload, signature] = token.split(".")
  if (!payload || !signature) return null

  const expectedSignature = sign(payload)
  if (expectedSignature.length !== signature.length) return null
  if (!timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))) return null

  try {
    const { sub, pur, exp } = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    ) as { sub?: string; pur?: ChallengePurpose; exp?: number }

    if (!sub || !exp || Date.now() > exp) return null
    if (pur !== expected) return null
    return { userId: sub, purpose: pur }
  } catch {
    return null
  }
}

export function challengeCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: TTL_MS / 1000,
  }
}
