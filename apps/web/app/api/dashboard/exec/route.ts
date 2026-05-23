import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { cacheKey, cached, TTL } from "@/lib/cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VIEW_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "BURSAR",
  "TEACHER",
]

type ExecPayload = {
  school: { id: string; name: string; currency: string }
  kpis: {
    studentCount: number
    attendanceTodayPct: number | null
    feeCollectionPct: number | null
    staffPresentToday: number
    outstandingFees: number
  }
  enrollmentTrend: {
    months: string[] // ["Jan", "Feb", ...] in academic-year order — for v1 we use calendar Jan-Dec
    thisYear: number[]
    lastYear: number[]
  }
  feeDonut: { paid: number; partial: number; unpaid: number }
  attendanceByClass: { classId: string; className: string; presentPct: number | null; total: number }[]
  recentPayments: {
    id: string
    amount: number
    paidAt: string
    studentName: string
    studentAdmission: string
    reference: string | null
  }[]
  upcomingEvents: { id: string; title: string; date: string; kind: "holiday" | "announcement" }[]
}

/**
 * GET /api/dashboard/exec — single aggregated payload for the home page.
 * Cached in Redis for 5 minutes per school. Pass `?bust=1` to recompute.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!VIEW_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const schoolId = session.user.schoolId
  const url = new URL(req.url)
  const bust = url.searchParams.get("bust") === "1"

  const result = await cached<ExecPayload>(
    cacheKey.dashboardExec(schoolId),
    TTL.dashboardExec,
    () => buildExecPayload(schoolId),
    { bust },
  )
  return NextResponse.json({ ...result.data, cached: result.cached })
}

async function buildExecPayload(schoolId: string): Promise<ExecPayload> {
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const endOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    23,
    59,
    59,
    999,
  )
  const thisYear = today.getFullYear()
  const lastYear = thisYear - 1

  const [
    school,
    studentCount,
    attendanceToday,
    staffPresentToday,
    invoiceAgg,
    invoiceByStatus,
    paymentsTodaySum,
    enrollmentsThisYear,
    enrollmentsLastYear,
    classes,
    recentPayments,
    holidays,
    announcements,
  ] = await Promise.all([
    prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, currency: true },
    }),
    prisma.student.count({
      where: { schoolId, deletedAt: null, status: "ACTIVE" },
    }),
    prisma.attendance.groupBy({
      by: ["status"],
      where: {
        schoolId,
        deletedAt: null,
        date: { gte: startOfToday, lte: endOfToday },
      },
      _count: { _all: true },
    }),
    prisma.staffAttendance.count({
      where: {
        schoolId,
        date: { gte: startOfToday, lte: endOfToday },
        status: "PRESENT",
      },
    }),
    prisma.feeInvoice.aggregate({
      where: { schoolId, deletedAt: null },
      _sum: { amountDue: true, amountPaid: true },
    }),
    prisma.feeInvoice.groupBy({
      by: ["status"],
      where: { schoolId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: { schoolId, deletedAt: null, paidAt: { gte: startOfToday, lte: endOfToday } },
      _sum: { amount: true },
    }),
    prisma.enrollment.findMany({
      where: {
        schoolId,
        deletedAt: null,
        enrolledOn: {
          gte: new Date(thisYear, 0, 1),
          lte: new Date(thisYear, 11, 31, 23, 59, 59),
        },
      },
      select: { enrolledOn: true },
    }),
    prisma.enrollment.findMany({
      where: {
        schoolId,
        deletedAt: null,
        enrolledOn: {
          gte: new Date(lastYear, 0, 1),
          lte: new Date(lastYear, 11, 31, 23, 59, 59),
        },
      },
      select: { enrolledOn: true },
    }),
    prisma.class.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: [{ level: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.payment.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: { paidAt: "desc" },
      take: 5,
      include: {
        invoice: {
          select: {
            student: {
              select: {
                admissionNumber: true,
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    }),
    prisma.holiday.findMany({
      where: {
        schoolId,
        deletedAt: null,
        endDate: { gte: startOfToday },
      },
      orderBy: { startDate: "asc" },
      take: 5,
      select: { id: true, name: true, startDate: true },
    }),
    prisma.announcement.findMany({
      where: {
        schoolId,
        deletedAt: null,
        publishedAt: { gt: today },
      },
      orderBy: { publishedAt: "asc" },
      take: 5,
      select: { id: true, title: true, publishedAt: true },
    }),
  ])

  if (!school) throw new Error("School not found")

  // KPIs
  const presentToday =
    attendanceToday.find((a) => a.status === "PRESENT")?._count._all ?? 0
  const totalToday = attendanceToday.reduce((s, a) => s + a._count._all, 0)
  const attendanceTodayPct =
    totalToday > 0 ? Math.round((presentToday / totalToday) * 100) : null

  const totalBilled = Number(invoiceAgg._sum?.amountDue ?? 0)
  const totalPaid = Number(invoiceAgg._sum?.amountPaid ?? 0)
  const outstandingFees = Math.max(0, totalBilled - totalPaid)
  const feeCollectionPct =
    totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : null

  // Enrolment trend: bucket by calendar month for both years.
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const thisYearBuckets = Array(12).fill(0) as number[]
  const lastYearBuckets = Array(12).fill(0) as number[]
  for (const e of enrollmentsThisYear) thisYearBuckets[e.enrolledOn.getMonth()] += 1
  for (const e of enrollmentsLastYear) lastYearBuckets[e.enrolledOn.getMonth()] += 1

  // Fee donut (per spec: Paid/Partial/Unpaid — collapse OVERDUE → unpaid)
  let paid = 0
  let partial = 0
  let unpaid = 0
  for (const r of invoiceByStatus) {
    if (r.status === "PAID") paid += r._count._all
    else if (r.status === "PARTIAL") partial += r._count._all
    else unpaid += r._count._all
  }

  // Attendance by class — needs a separate query because we need to group
  // by class via the section→class chain. Fan-out per class for simplicity.
  const attendanceByClass: ExecPayload["attendanceByClass"] = await Promise.all(
    classes.map(async (c) => {
      const rows = await prisma.attendance.findMany({
        where: {
          schoolId,
          deletedAt: null,
          date: { gte: startOfToday, lte: endOfToday },
          section: { classId: c.id },
        },
        select: { status: true },
      })
      const present = rows.filter((r) => r.status === "PRESENT").length
      const total = rows.length
      return {
        classId: c.id,
        className: c.name,
        presentPct: total > 0 ? Math.round((present / total) * 100) : null,
        total,
      }
    }),
  )

  const payload: ExecPayload = {
    school,
    kpis: {
      studentCount,
      attendanceTodayPct,
      feeCollectionPct,
      staffPresentToday,
      outstandingFees,
    },
    enrollmentTrend: {
      months,
      thisYear: thisYearBuckets,
      lastYear: lastYearBuckets,
    },
    feeDonut: { paid, partial, unpaid },
    attendanceByClass,
    recentPayments: recentPayments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      paidAt: p.paidAt.toISOString(),
      studentName: `${p.invoice.student.user.firstName} ${p.invoice.student.user.lastName}`,
      studentAdmission: p.invoice.student.admissionNumber,
      reference: p.reference ?? null,
    })),
    upcomingEvents: [
      ...holidays.map((h) => ({
        id: h.id,
        title: h.name,
        date: h.startDate.toISOString(),
        kind: "holiday" as const,
      })),
      ...announcements.map((a) => ({
        id: a.id,
        title: a.title,
        date: (a.publishedAt ?? new Date()).toISOString(),
        kind: "announcement" as const,
      })),
    ]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5),
  }

  // Silence unused-var lint for paymentsTodaySum (kept for future "today's
  // collections" metric — not exposed in this payload yet).
  void paymentsTodaySum

  return payload
}
