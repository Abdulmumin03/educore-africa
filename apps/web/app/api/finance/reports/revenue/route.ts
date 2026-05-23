import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveFinanceAccess } from "@/lib/finance-access"

export const runtime = "nodejs"

/**
 * Revenue summary: invoiced / collected / outstanding per term, plus a
 * collection breakdown by channel and a per-class table. Powers the
 * /dashboard/finance/reports landing.
 */
export async function GET(req: Request) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const termId = url.searchParams.get("termId")
  const fromStr = url.searchParams.get("from")
  const toStr = url.searchParams.get("to")
  const from = fromStr ? new Date(fromStr) : null
  const to = toStr ? new Date(toStr) : null

  const invoiceWhere = {
    schoolId: access.session.schoolId,
    deletedAt: null,
    ...(termId ? { termId } : {}),
  }
  const paymentWhere = {
    schoolId: access.session.schoolId,
    deletedAt: null,
    ...(termId ? { invoice: { termId } } : {}),
    ...(from || to
      ? { paidAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  }

  const [invoiceTotals, paymentTotals, byChannel, byTerm, byClass] = await Promise.all([
    prisma.feeInvoice.aggregate({
      where: invoiceWhere,
      _sum: { amountDue: true, amountPaid: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: paymentWhere,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payment.groupBy({
      by: ["channel"],
      where: paymentWhere,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.feeInvoice.groupBy({
      by: ["termId"],
      where: { schoolId: access.session.schoolId, deletedAt: null },
      _sum: { amountDue: true, amountPaid: true },
      _count: { _all: true },
    }),
    prisma.feeInvoice.findMany({
      where: invoiceWhere,
      include: {
        student: {
          include: {
            enrollments: {
              where: { isActive: true, deletedAt: null },
              take: 1,
              include: { class: { select: { id: true, name: true, level: true } } },
            },
          },
        },
      },
    }),
  ])

  // Per-class aggregation.
  type ClassAgg = { classId: string; className: string; level: number; due: number; paid: number; count: number }
  const classMap = new Map<string, ClassAgg>()
  for (const inv of byClass) {
    const klass = inv.student.enrollments[0]?.class
    if (!klass) continue
    const cur = classMap.get(klass.id) ?? {
      classId: klass.id,
      className: klass.name,
      level: klass.level,
      due: 0,
      paid: 0,
      count: 0,
    }
    cur.due += Number(inv.amountDue)
    cur.paid += Number(inv.amountPaid)
    cur.count += 1
    classMap.set(klass.id, cur)
  }
  const perClass = Array.from(classMap.values())
    .sort((a, b) => a.level - b.level)
    .map((c) => ({
      classId: c.classId,
      className: c.className,
      invoiced: c.due,
      collected: c.paid,
      outstanding: Math.max(0, c.due - c.paid),
      collectionRate: c.due > 0 ? Math.round((c.paid / c.due) * 100) : null,
      invoices: c.count,
    }))

  // Per-term breakdown (resolve names).
  const termIds = byTerm.map((t) => t.termId)
  const terms = termIds.length
    ? await prisma.term.findMany({
        where: { id: { in: termIds } },
        include: { academicYear: { select: { name: true } } },
      })
    : []
  const termById = new Map(terms.map((t) => [t.id, t]))
  const perTerm = byTerm.map((t) => {
    const term = termById.get(t.termId)
    return {
      termId: t.termId,
      label: term
        ? `${term.academicYear.name} ${term.type[0] + term.type.slice(1).toLowerCase()}`
        : t.termId,
      invoiced: Number(t._sum.amountDue ?? 0),
      collected: Number(t._sum.amountPaid ?? 0),
      outstanding: Math.max(0, Number(t._sum.amountDue ?? 0) - Number(t._sum.amountPaid ?? 0)),
      invoices: t._count._all,
    }
  })

  const invoiced = Number(invoiceTotals._sum.amountDue ?? 0)
  const collected = Number(invoiceTotals._sum.amountPaid ?? 0)

  return NextResponse.json({
    summary: {
      invoices: invoiceTotals._count._all,
      invoiced,
      collected,
      outstanding: Math.max(0, invoiced - collected),
      collectionRate: invoiced > 0 ? Math.round((collected / invoiced) * 100) : null,
      paymentsCount: paymentTotals._count._all,
      paymentsAmount: Number(paymentTotals._sum.amount ?? 0),
    },
    byChannel: byChannel.map((c) => ({
      channel: c.channel,
      count: c._count._all,
      amount: Number(c._sum.amount ?? 0),
    })),
    perTerm,
    perClass,
  })
}
