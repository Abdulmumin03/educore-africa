import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"

import { prisma } from "@/lib/db"

// Eight single-use codes, shown once at enrolment and stored only as bcrypt
// hashes — same treatment as a password, because that is what they are.
export const BACKUP_CODE_COUNT = 8

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no I/O/0/1

function oneCode(): string {
  const bytes = randomBytes(10)
  const chars = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length])
  return `${chars.slice(0, 5).join("")}-${chars.slice(5, 10).join("")}`
}

/** Generate a fresh set, replacing any existing codes for the user. */
export async function issueBackupCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, oneCode)
  const hashes = await Promise.all(codes.map((code) => bcrypt.hash(normalise(code), 10)))

  await prisma.$transaction([
    prisma.superAdminBackupCode.deleteMany({ where: { userId } }),
    prisma.superAdminBackupCode.createMany({
      data: hashes.map((codeHash) => ({ userId, codeHash })),
    }),
  ])

  return codes
}

function normalise(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase()
}

/** Looks like a backup code rather than a 6-digit TOTP? */
export function looksLikeBackupCode(value: string): boolean {
  return normalise(value).length === 10
}

/**
 * Verify and burn a backup code. Returns true only if an unused code matched;
 * the row is marked used in the same call so it cannot be replayed.
 */
export async function consumeBackupCode(userId: string, input: string): Promise<boolean> {
  const candidate = normalise(input)
  if (candidate.length !== 10) return false

  const rows = await prisma.superAdminBackupCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  })

  for (const row of rows) {
    if (await bcrypt.compare(candidate, row.codeHash)) {
      // updateMany with the usedAt guard makes the burn atomic: two parallel
      // submissions of the same code cannot both come back true.
      const burned = await prisma.superAdminBackupCode.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      return burned.count === 1
    }
  }

  return false
}

export function remainingBackupCodes(userId: string): Promise<number> {
  return prisma.superAdminBackupCode.count({ where: { userId, usedAt: null } })
}
