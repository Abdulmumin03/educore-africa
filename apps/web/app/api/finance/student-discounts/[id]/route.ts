import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { resolveFinanceAccess } from "@/lib/finance-access"

export const runtime = "nodejs"

const patchSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "REVOKE"]),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 })

  const existing = await prisma.studentDiscount.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true, status: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // APPROVE / REJECT require approver role; REVOKE can be done by bursar.
  if ((parsed.data.action === "APPROVE" || parsed.data.action === "REJECT") && !access.canApprove) {
    return NextResponse.json({ error: "Only admins/principals can approve" }, { status: 403 })
  }
  if (parsed.data.action === "REVOKE" && !access.canWrite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const nextStatus =
    parsed.data.action === "APPROVE"
      ? "APPROVED"
      : parsed.data.action === "REJECT"
        ? "REJECTED"
        : "REVOKED"

  await prisma.studentDiscount.update({
    where: { id: existing.id },
    data: {
      status: nextStatus,
      reason: parsed.data.reason || undefined,
      approvedById: parsed.data.action === "APPROVE" ? access.session.userId : undefined,
      approvedAt: parsed.data.action === "APPROVE" ? new Date() : undefined,
    },
  })

  return NextResponse.json({ ok: true, status: nextStatus })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const existing = await prisma.studentDiscount.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.studentDiscount.update({
    where: { id: existing.id },
    data: { deletedAt: new Date(), status: "REVOKED" },
  })

  return NextResponse.json({ ok: true })
}
