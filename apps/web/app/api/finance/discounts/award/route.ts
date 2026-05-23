import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveFinanceAccess } from "@/lib/finance-access"
import { awardDiscountSchema } from "@/lib/finance-schemas"

export const runtime = "nodejs"

/**
 * Grant a discount to a specific student. Status defaults to PENDING when the
 * discount requires approval, APPROVED otherwise.
 */
export async function POST(req: Request) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = awardDiscountSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { studentId, discountId, reason } = parsed.data

  const [discount, student] = await Promise.all([
    prisma.feeDiscount.findFirst({
      where: { id: discountId, schoolId: access.session.schoolId, deletedAt: null },
      select: { id: true, requiresApproval: true, name: true },
    }),
    prisma.student.findFirst({
      where: { id: studentId, schoolId: access.session.schoolId, deletedAt: null },
      select: { id: true },
    }),
  ])
  if (!discount || !student) {
    return NextResponse.json({ error: "Discount or student not found" }, { status: 404 })
  }

  const initialStatus = discount.requiresApproval && !access.canApprove ? "PENDING" : "APPROVED"

  try {
    const award = await prisma.studentDiscount.upsert({
      where: { studentId_discountId: { studentId, discountId } },
      create: {
        schoolId: access.session.schoolId,
        studentId,
        discountId,
        status: initialStatus,
        requestedById: access.session.userId,
        approvedById: initialStatus === "APPROVED" ? access.session.userId : null,
        approvedAt: initialStatus === "APPROVED" ? new Date() : null,
        reason: reason || null,
      },
      update: {
        deletedAt: null,
        status: initialStatus,
        reason: reason || undefined,
      },
      select: { id: true, status: true },
    })
    return NextResponse.json({ ok: true, id: award.id, status: award.status })
  } catch (err) {
    console.error("[discounts/award]", err)
    return NextResponse.json({ error: "Couldn't award discount" }, { status: 500 })
  }
}
