import { cookies } from "next/headers"

import { decryptSecret, encryptSecret } from "@/lib/crypto"

// The candidate secret must survive the round trip between "show me a QR
// code" and "here is a code proving I scanned it" WITHOUT being written to
// the user row — overwriting a live totpSecret before confirmation would lock
// an existing admin out of their own account.
//
// It rides in an encrypted, httpOnly cookie instead: no extra table, no Redis
// dependency in the enrolment path, and unforgeable without SUPERADMIN_SECRET.

export const PENDING_TOTP_COOKIE = "educore-sa.totp-pending"
const TTL_SECONDS = 10 * 60

type Pending = { userId: string; secret: string }

export function storePendingSecret(userId: string, secret: string): void {
  cookies().set(PENDING_TOTP_COOKIE, encryptSecret(JSON.stringify({ userId, secret })), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: TTL_SECONDS,
  })
}

/** Returns the pending secret only if it belongs to the expected user. */
export function readPendingSecret(userId: string): string | null {
  const raw = cookies().get(PENDING_TOTP_COOKIE)?.value
  if (!raw) return null

  const decrypted = decryptSecret(raw)
  if (!decrypted) return null

  try {
    const pending = JSON.parse(decrypted) as Pending
    if (pending.userId !== userId || !pending.secret) return null
    return pending.secret
  } catch {
    return null
  }
}

export function clearPendingSecret(): void {
  cookies().delete(PENDING_TOTP_COOKIE)
}
