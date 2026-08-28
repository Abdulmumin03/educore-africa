import { prisma } from "@/lib/db"
import { AUTH_ACTIONS, auditLog, auditTarget } from "@/lib/audit"

// 5 failures in a row locks the account for 15 minutes. The counter lives on
// the user row rather than in Redis so flushing the cache cannot hand an
// attacker a fresh allowance. It covers password AND TOTP failures together —
// an attacker who has the password shouldn't get a separate budget for codes.
export const MAX_ATTEMPTS = 5
export const LOCK_MINUTES = 15

export type LockState = { locked: boolean; until: Date | null; remaining: number }

export function lockState(user: {
  failedLoginAttempts: number
  lockedUntil: Date | null
}): LockState {
  const locked = Boolean(user.lockedUntil && user.lockedUntil > new Date())
  return {
    locked,
    until: locked ? user.lockedUntil : null,
    remaining: Math.max(0, MAX_ATTEMPTS - user.failedLoginAttempts),
  }
}

/**
 * Record a failed attempt. Returns the resulting lock state so the caller can
 * tell the user how many tries are left (or that they are now locked out).
 */
export async function registerFailure(
  userId: string,
  reason: string,
  ipAddress: string,
): Promise<LockState> {
  const user = await prisma.superAdminUser.findUnique({
    where: { id: userId },
    select: { failedLoginAttempts: true, lockedUntil: true },
  })
  if (!user) return { locked: false, until: null, remaining: MAX_ATTEMPTS }

  // A stale lock that has already elapsed restarts the count at 1.
  const expired = user.lockedUntil !== null && user.lockedUntil <= new Date()
  const attempts = (expired ? 0 : user.failedLoginAttempts) + 1
  const shouldLock = attempts >= MAX_ATTEMPTS
  const until = shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : expired ? null : user.lockedUntil

  await prisma.superAdminUser.update({
    where: { id: userId },
    data: { failedLoginAttempts: attempts, lockedUntil: until },
  })

  if (shouldLock) {
    await auditLog({
      userId,
      action: AUTH_ACTIONS.ACCOUNT_LOCKED,
      target: auditTarget("user", userId),
      targetType: "user",
      ipAddress,
      details: { reason, attempts, lockedForMinutes: LOCK_MINUTES },
    })
  }

  return {
    locked: shouldLock,
    until: shouldLock ? until : null,
    remaining: Math.max(0, MAX_ATTEMPTS - attempts),
  }
}

/** Called on every successful authentication. */
export async function clearFailures(userId: string): Promise<void> {
  await prisma.superAdminUser.updateMany({
    where: { id: userId, OR: [{ failedLoginAttempts: { gt: 0 } }, { lockedUntil: { not: null } }] },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  })
}

export function lockoutMessage(until: Date | null): string {
  if (!until) return `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000))
  return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
}
