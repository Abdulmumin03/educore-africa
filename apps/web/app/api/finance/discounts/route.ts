import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { resolveFinanceAccess } from "@/lib/finance-access"
import { upsertDiscountSchema } from "@/lib/finance-schemas"

export const runtime = "nodejs"

/** List active discount catalog + how many students are currently awarded each. */
export async function GET() {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response

  const discounts = await prisma.feeDiscount.findMany({
    where: { schoolId: access.session.schoolId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { awarded: { where: { deletedAt: null, status: "APPROVED" } } },
      },
    },
  })
  return NextResponse.json({
    items: discounts.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      percent: d.percent ? Number(d.percent) : null,
      fixedAmount: d.fixedAmount ? Number(d.fixedAmount) : null,
      requiresApproval: d.requiresApproval,
      autoApply: d.autoApply,
      isActive: d.isActive,
      awardedCount: d._count.awarded,
    })),
  })
}

export async function POST(req: Request) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = upsertDiscountSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const d = parsed.data
  if (d.percent == null && d.fixedAmount == null) {
    return NextResponse.json(
      { error: "Either percent or fixedAmount is required" },
      { status: 422 },
    )
  }

  const created = await prisma.feeDiscount.create({
    data: {
      schoolId: access.session.schoolId,
      name: d.name,
      type: d.type,
      percent: d.percent != null ? new Prisma.Decimal(d.percent) : null,
      fixedAmount: d.fixedAmount != null ? new Prisma.Decimal(d.fixedAmount) : null,
      requiresApproval: d.requiresApproval,
      autoApply: d.autoApply,
      isActive: d.isActive,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
}
