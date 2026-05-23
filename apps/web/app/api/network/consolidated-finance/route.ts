import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const schools = await prisma.school.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, currency: true },
  })

  const [invoiceAgg, payments] = await Promise.all([
    prisma.feeInvoice.groupBy({
      by: ["schoolId"],
      where: { deletedAt: null },
      _sum: { amountDue: true, amountPaid: true },
    }),
    prisma.payment.groupBy({
      by: ["schoolId"],
      where: { deletedAt: null },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ])

  const invoiceMap = new Map(invoiceAgg.map((i) => [i.schoolId, i._sum]))
  const paymentMap = new Map(payments.map((p) => [p.schoolId, p]))

  let networkBilled = 0
  let networkPaid = 0
  let networkOutstanding = 0
  let networkPaymentCount = 0

  const rows = schools.map((s) => {
    const inv = invoiceMap.get(s.id)
    const pay = paymentMap.get(s.id)
    const billed = Number(inv?.amountDue ?? 0)
    const paid = Number(inv?.amountPaid ?? 0)
    const outstanding = Math.max(0, billed - paid)
    networkBilled += billed
    networkPaid += paid
    networkOutstanding += outstanding
    networkPaymentCount += pay?._count._all ?? 0
    return {
      schoolId: s.id,
      name: s.name,
      currency: s.currency,
      billed,
      paid,
      outstanding,
      paymentCount: pay?._count._all ?? 0,
      ratePct: billed > 0 ? Math.round((paid / billed) * 100) : 0,
    }
  })

  return NextResponse.json({
    network: {
      schoolCount: schools.length,
      billed: networkBilled,
      paid: networkPaid,
      outstanding: networkOutstanding,
      paymentCount: networkPaymentCount,
      ratePct: networkBilled > 0 ? Math.round((networkPaid / networkBilled) * 100) : 0,
    },
    rows: rows.sort((a, b) => b.billed - a.billed),
  })
}
