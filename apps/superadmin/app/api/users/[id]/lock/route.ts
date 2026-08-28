import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

/**
 * Disable or re-enable a school account.
 *
 * There is no lockout column on User — the school app gates sign-in on
 * isActive — so "lock" means deactivate and drop every live session. Without
 * the session sweep a locked user would stay signed in until their cookie
 * lapsed, which is not a lock.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "SUPPORT_ADMIN")
  if (forbidden) return forbidden

  let body: { locked?: unknown; reason?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  if (typeof body.locked !== "boolean") {
    return NextResponse.json({ error: "`locked` must be true or false." }, { status: 400 })
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : ""
  if (body.locked && !reason) {
    return NextResponse.json({ error: "A reason is required when locking an account." }, { status: 400 })
  }

  const user = await prisma.user.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, email: true, isActive: true, schoolId: true },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const locked = body.locked
  const [, sessions] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { isActive: !locked } }),
    locked
      ? prisma.session.deleteMany({ where: { userId: user.id } })
      : prisma.session.deleteMany({ where: { userId: user.id, expires: { lt: new Date() } } }),
  ])

  await auditLog({
    userId: guard.user.id,
    action: locked ? "user.lock" : "user.unlock",
    target: auditTarget("user", user.id),
    targetType: "user",
    ipAddress: guard.ipAddress,
    details: { email: user.email, schoolId: user.schoolId, reason: reason || null, sessionsCleared: sessions.count },
  })

  return NextResponse.json({
    id: user.id,
    isActive: !locked,
    sessionsCleared: sessions.count,
  })
}
