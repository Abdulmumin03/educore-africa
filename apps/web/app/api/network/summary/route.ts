import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/network/summary — per-school KPI row for the network dashboard.
 * SUPER_ADMIN only. Returns enrolment, attendance %, fee collection %, avg
 * grade for every school in the database.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const schools = await prisma.school.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      country: true,
      currency: true,
      logoUrl: true,
    },
  })
  if (schools.length === 0) return NextResponse.json({ items: [] })

  const schoolIds = schools.map((s) => s.id)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // last 30 days

  const [students, attendance, invoiceAgg, grades] = await Promise.all([
    prisma.student.groupBy({
      by: ["schoolId"],
      where: { schoolId: { in: schoolIds }, deletedAt: null, status: "ACTIVE" },
      _count: { _all: true },
    }),
    prisma.attendance.groupBy({
      by: ["schoolId", "status"],
      where: {
        schoolId: { in: schoolIds },
        deletedAt: null,
        date: { gte: since },
      },
      _count: { _all: true },
    }),
    prisma.feeInvoice.groupBy({
      by: ["schoolId"],
      where: { schoolId: { in: schoolIds }, deletedAt: null },
      _sum: { amountDue: true, amountPaid: true },
    }),
    prisma.grade.groupBy({
      by: ["schoolId"],
      where: { schoolId: { in: schoolIds }, deletedAt: null },
      _avg: { totalScore: true },
    }),
  ])

  const studentMap = new Map(students.map((s) => [s.schoolId, s._count._all]))
  const gradeMap = new Map(grades.map((g) => [g.schoolId, g._avg.totalScore]))
  const invoiceMap = new Map(
    invoiceAgg.map((i) => [
      i.schoolId,
      {
        billed: Number(i._sum?.amountDue ?? 0),
        paid: Number(i._sum?.amountPaid ?? 0),
      },
    ]),
  )

  const attMap = new Map<string, { present: number; total: number }>()
  for (const a of attendance) {
    const b = attMap.get(a.schoolId) ?? { present: 0, total: 0 }
    if (a.status === "PRESENT") b.present += a._count._all
    b.total += a._count._all
    attMap.set(a.schoolId, b)
  }

  return NextResponse.json({
    items: schools.map((s) => {
      const inv = invoiceMap.get(s.id)
      const att = attMap.get(s.id)
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        city: s.city,
        country: s.country,
        currency: s.currency,
        logoUrl: s.logoUrl,
        kpis: {
          students: studentMap.get(s.id) ?? 0,
          attendancePct:
            att && att.total > 0 ? Math.round((att.present / att.total) * 100) : null,
          feeCollectionPct:
            inv && inv.billed > 0 ? Math.round((inv.paid / inv.billed) * 100) : null,
          avgGrade:
            gradeMap.get(s.id) !== null && gradeMap.get(s.id) !== undefined
              ? Math.round((gradeMap.get(s.id) as number) * 10) / 10
              : null,
        },
      }
    }),
  })
}
