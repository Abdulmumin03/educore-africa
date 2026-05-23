import { NextResponse } from "next/server"
import { z } from "zod"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BURSAR"]

const patchSchema = z.object({
  action: z.enum(["MARK_PAID", "MARK_UNPAID"]),
  note: z.string().trim().max(240).optional().or(z.literal("")),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 })

  const existing = await prisma.payslip.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true, staff: { select: { userId: true } } },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.payslip.update({
    where: { id: existing.id },
    data: {
      paidAt: parsed.data.action === "MARK_PAID" ? new Date() : null,
      note: parsed.data.note || null,
    },
    select: { paidAt: true },
  })

  if (parsed.data.action === "MARK_PAID") {
    await prisma.notification.create({
      data: {
        schoolId: session.user.schoolId,
        userId: existing.staff.userId,
        channel: "IN_APP",
        title: "Payslip ready",
        body: "Your salary has been processed and is available on your Payroll tab.",
        metadata: { payslipId: existing.id },
        sentAt: new Date(),
      },
    })
  }

  return NextResponse.json({ ok: true, paidAt: updated.paidAt?.toISOString() ?? null })
}
