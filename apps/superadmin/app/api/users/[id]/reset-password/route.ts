import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { randomBytes } from "node:crypto"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

// Readable but not guessable: no 0/O/1/l, and 12 characters of it.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"

function temporaryPassword(): string {
  const bytes = randomBytes(12)
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("")
}

/**
 * Issue a temporary password for a school account.
 *
 * The platform has no password-reset token table and no must-change-password
 * flag, so this cannot force a rotation on next sign-in. What it does do is
 * generate a fresh password, return it to the operator ONCE, and clear every
 * session so the old credential is dead immediately. The console tells the
 * operator to hand it over out-of-band and asks the school to change it — the
 * response says as much rather than implying an enforced flow.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "SUPPORT_ADMIN")
  if (forbidden) return forbidden

  const user = await prisma.user.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, email: true, schoolId: true },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const password = temporaryPassword()
  const passwordHash = await bcrypt.hash(password, 10)

  const [, sessions] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ])

  await auditLog({
    userId: guard.user.id,
    action: "user.password.reset",
    target: auditTarget("user", user.id),
    targetType: "user",
    ipAddress: guard.ipAddress,
    // Never the password itself.
    details: { email: user.email, schoolId: user.schoolId, sessionsCleared: sessions.count },
  })

  return NextResponse.json({
    temporaryPassword: password,
    sessionsCleared: sessions.count,
    notice:
      "Shown once. Hand it over out-of-band and ask the account holder to change it — the platform has no forced-rotation flag to enforce that.",
  })
}
