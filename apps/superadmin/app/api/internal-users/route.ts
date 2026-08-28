import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import type { SuperAdminRole } from "@prisma/client"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { CONSOLE_ROLES } from "@/lib/console-roles"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"


export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const users = await prisma.superAdminUser.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      totpEnabled: true,
      allowedIPs: true,
      lastLoginAt: true,
      createdAt: true,
      sessions: {
        where: { revokedAt: null, absoluteExpiresAt: { gt: new Date() } },
        select: { id: true },
      },
    },
  })

  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      totpEnabled: user.totpEnabled,
      allowedIPs: user.allowedIPs,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      liveSessions: user.sessions.length,
    })),
    roles: CONSOLE_ROLES,
  })
}

/**
 * Create a console staff account.
 *
 * SUPER_ADMIN only — this grants access to every school's data, so it is not
 * something a support lead should be able to hand out. The account is created
 * without TOTP; the auth flow forces enrolment before the console opens, so
 * there is no window in which a staff account is password-only.
 */
export async function POST(request: Request) {
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

  const name = typeof body.name === "string" ? body.name.trim() : ""
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body.password === "string" ? body.password : ""
  const role =
    typeof body.role === "string" && CONSOLE_ROLES.includes(body.role as SuperAdminRole)
      ? (body.role as SuperAdminRole)
      : null
  const allowedIPs = Array.isArray(body.allowedIPs)
    ? body.allowedIPs.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    : []

  if (!name || !email || !role) {
    return NextResponse.json({ error: "Name, email and a valid role are required." }, { status: 400 })
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 })
  }
  if (password.length < 12) {
    return NextResponse.json({ error: "Console passwords must be at least 12 characters." }, { status: 400 })
  }

  const clash = await prisma.superAdminUser.findUnique({ where: { email }, select: { id: true } })
  if (clash) return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 })

  const user = await prisma.superAdminUser.create({
    data: {
      name,
      email,
      role,
      passwordHash: await bcrypt.hash(password, 12),
      allowedIPs,
      isActive: true,
    },
    select: { id: true, name: true, email: true, role: true, isActive: true, totpEnabled: true },
  })

  await auditLog({
    userId: guard.user.id,
    action: "internal-user.create",
    target: auditTarget("user", user.id),
    targetType: "user",
    ipAddress: guard.ipAddress,
    details: { email, role, allowedIPs: allowedIPs.length },
  })

  return NextResponse.json(
    { user, notice: "The account must enrol TOTP at first sign-in before the console opens." },
    { status: 201 },
  )
}
