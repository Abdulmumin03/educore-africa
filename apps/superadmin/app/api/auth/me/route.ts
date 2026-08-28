import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { remainingBackupCodes } from "@/lib/backup-codes"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const [session, backupCodesRemaining] = await Promise.all([
    prisma.superAdminSession.findUnique({
      where: { token: guard.user.sessionId },
      select: { expiresAt: true, absoluteExpiresAt: true, lastActiveAt: true, ipAddress: true },
    }),
    remainingBackupCodes(guard.user.id),
  ])

  const account = await prisma.superAdminUser.findUnique({
    where: { id: guard.user.id },
    select: { totpEnabled: true, totpConfirmedAt: true, lastLoginAt: true, allowedIPs: true },
  })

  return NextResponse.json({
    user: {
      id: guard.user.id,
      email: guard.user.email,
      name: guard.user.name,
      role: guard.user.role,
      totpEnabled: account?.totpEnabled ?? false,
      totpConfirmedAt: account?.totpConfirmedAt ?? null,
      lastLoginAt: account?.lastLoginAt ?? null,
      allowedIPs: account?.allowedIPs ?? [],
      backupCodesRemaining,
    },
    session: {
      // Client-side idle countdown reads these.
      idleExpiresAt: session?.expiresAt ?? null,
      absoluteExpiresAt: session?.absoluteExpiresAt ?? null,
      lastActiveAt: session?.lastActiveAt ?? null,
      ipAddress: session?.ipAddress ?? guard.ipAddress,
    },
  })
}
