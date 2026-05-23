import { NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { randomBytes } from "node:crypto"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/audit"

export const runtime = "nodejs"

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

const patchSchema = z
  .object({
    action: z.enum(["suspend", "reactivate", "reset-password"]).optional(),
    role: z
      .enum([
        "SCHOOL_ADMIN",
        "PRINCIPAL",
        "TEACHER",
        "BURSAR",
        "COUNSELOR",
        "LIBRARIAN",
        "HOSTEL_MASTER",
        "DRIVER",
        "PARENT",
      ])
      .optional(),
  })
  .refine((v) => !!v.action || !!v.role, {
    message: "Specify action or role",
  })

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!ADMIN_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const target = await prisma.user.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true, isActive: true, role: true, email: true },
  })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Admins can't downgrade themselves out of admin (would lock them out).
  if (target.id === session.user.id) {
    return NextResponse.json(
      { error: "You can't modify your own account here. Use Profile instead." },
      { status: 409 },
    )
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data

  if (data.role) {
    await prisma.user.update({
      where: { id: target.id },
      data: { role: data.role as UserRole },
    })
    await logAudit({
      schoolId: session.user.schoolId,
      userId: session.user.id,
      action: "user.role-change",
      entityType: "User",
      entityId: target.id,
      before: { role: target.role },
      after: { role: data.role },
    })
    return NextResponse.json({ ok: true })
  }

  if (data.action === "suspend") {
    if (!target.isActive) return NextResponse.json({ ok: true, alreadySuspended: true })
    await prisma.user.update({
      where: { id: target.id },
      data: { isActive: false },
    })
    await logAudit({
      schoolId: session.user.schoolId,
      userId: session.user.id,
      action: "user.suspend",
      entityType: "User",
      entityId: target.id,
      before: { isActive: true },
      after: { isActive: false },
    })
    return NextResponse.json({ ok: true })
  }
  if (data.action === "reactivate") {
    if (target.isActive) return NextResponse.json({ ok: true, alreadyActive: true })
    await prisma.user.update({
      where: { id: target.id },
      data: { isActive: true },
    })
    await logAudit({
      schoolId: session.user.schoolId,
      userId: session.user.id,
      action: "user.reactivate",
      entityType: "User",
      entityId: target.id,
      before: { isActive: false },
      after: { isActive: true },
    })
    return NextResponse.json({ ok: true })
  }
  if (data.action === "reset-password") {
    const tempPassword = randomBytes(8).toString("base64url").slice(0, 12)
    const passwordHash = await bcrypt.hash(tempPassword, 12)
    await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash },
    })
    await logAudit({
      schoolId: session.user.schoolId,
      userId: session.user.id,
      action: "user.reset-password",
      entityType: "User",
      entityId: target.id,
    })
    return NextResponse.json({ ok: true, tempPassword })
  }
  return NextResponse.json({ error: "Nothing to do" }, { status: 400 })
}
