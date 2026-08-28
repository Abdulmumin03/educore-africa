import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import type { SuperAdminRole } from "@prisma/client"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { CONSOLE_ROLES } from "@/lib/console-roles"
import { invalidateUserAllowlist } from "@/lib/ip"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"


export const dynamic = "force-dynamic"

/** Edit a console staff account: role, activation, allowlist, password, TOTP reset. */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user)
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const existing = await prisma.superAdminUser.findUnique({
    where: { id: params.id },
    select: { id: true, email: true, role: true, isActive: true, allowedIPs: true, totpEnabled: true },
  })
  if (!existing) return NextResponse.json({ error: "Account not found" }, { status: 404 })

  const data: Record<string, unknown> = {}
  const changed: string[] = []

  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim()
    changed.push("name")
  }

  if (typeof body.role === "string" && CONSOLE_ROLES.includes(body.role as SuperAdminRole)) {
    // Demoting yourself out of SUPER_ADMIN would lock the last owner out of
    // this very endpoint, so refuse it rather than leave a rescue-by-SQL.
    if (existing.id === guard.user.id && body.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "You cannot change your own role — ask another SUPER_ADMIN." },
        { status: 400 },
      )
    }
    data.role = body.role as SuperAdminRole
    changed.push("role")
  }

  if (typeof body.isActive === "boolean") {
    if (existing.id === guard.user.id && !body.isActive) {
      return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 })
    }
    data.isActive = body.isActive
    changed.push("isActive")
  }

  if (Array.isArray(body.allowedIPs)) {
    data.allowedIPs = body.allowedIPs.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim() !== "",
    )
    changed.push("allowedIPs")
  }

  if (typeof body.password === "string" && body.password) {
    if (body.password.length < 12) {
      return NextResponse.json({ error: "Console passwords must be at least 12 characters." }, { status: 400 })
    }
    data.passwordHash = await bcrypt.hash(body.password, 12)
    changed.push("password")
  }

  // Resetting TOTP clears the secret and the backup codes together — leaving
  // stale codes behind would keep a second door open on the old enrolment.
  if (body.resetTotp === true) {
    data.totpEnabled = false
    data.totpSecret = null
    data.totpConfirmedAt = null
    data.backupCodes = { deleteMany: {} }
    changed.push("totp")
  }

  if (changed.length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 })

  const user = await prisma.superAdminUser.update({
    where: { id: existing.id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      totpEnabled: true,
      allowedIPs: true,
    },
  })

  // The allowlist is cached in Redis per user; a stale entry would keep
  // enforcing the old list until its TTL lapsed.
  if (changed.includes("allowedIPs")) await invalidateUserAllowlist(user.id)

  // A deactivated account, a new password or a cleared TOTP secret must not
  // leave live sessions behind.
  let sessionsRevoked = 0
  if (changed.includes("password") || changed.includes("totp") || data.isActive === false) {
    const result = await prisma.superAdminSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "credentials-changed" },
    })
    sessionsRevoked = result.count
  }

  await auditLog({
    userId: guard.user.id,
    action: "internal-user.update",
    target: auditTarget("user", user.id),
    targetType: "user",
    ipAddress: guard.ipAddress,
    details: { email: existing.email, changed, sessionsRevoked },
  })

  return NextResponse.json({ user, sessionsRevoked })
}
