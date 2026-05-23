import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { resolveFinanceAccess } from "@/lib/finance-access"

export const runtime = "nodejs"

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  percent: z.number().min(0).max(100).nullable().optional(),
  fixedAmount: z.number().min(0).max(10_000_000).nullable().optional(),
  requiresApproval: z.boolean().optional(),
  autoApply: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 })
  const d = parsed.data

  const existing = await prisma.feeDiscount.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.feeDiscount.update({
    where: { id: existing.id },
    data: {
      name: d.name,
      percent:
        d.percent === undefined
          ? undefined
          : d.percent === null
            ? null
            : new Prisma.Decimal(d.percent),
      fixedAmount:
        d.fixedAmount === undefined
          ? undefined
          : d.fixedAmount === null
            ? null
            : new Prisma.Decimal(d.fixedAmount),
      requiresApproval: d.requiresApproval,
      autoApply: d.autoApply,
      isActive: d.isActive,
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const existing = await prisma.feeDiscount.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.feeDiscount.update({
    where: { id: existing.id },
    data: { deletedAt: new Date(), isActive: false },
  })

  return NextResponse.json({ ok: true })
}
