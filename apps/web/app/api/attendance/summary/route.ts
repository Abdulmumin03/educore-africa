import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveAttendanceAccess } from "@/lib/attendance-access"
import { dayOnly } from "@/lib/attendance-schemas"

export const runtime = "nodejs"

/**
 * Per-student attendance summary. Defaults to the current term if `termId` is
 * omitted. Accepts `from` / `to` date overrides.
 */
export async function GET(req: Request) {
  const access = await resolveAttendanceAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const studentId = url.searchParams.get("studentId")
  const termId = url.searchParams.get("termId")
  const fromStr = url.searchParams.get("from")
  const toStr = url.searchParams.get("to")
  if (!studentId) return NextResponse.json({ error: "studentId required" }, { status: 422 })

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let resolvedTermId = termId
  if (!resolvedTermId && !fromStr && !toStr) {
    const term = await prisma.term.findFirst({
      where: { isCurrent: true, academicYear: { schoolId: access.session.schoolId } },
      select: { id: true },
    })
    resolvedTermId = term?.id ?? null
  }

  const where = {
    studentId,
    deletedAt: null,
    ...(resolvedTermId ? { termId: resolvedTermId } : {}),
    ...(fromStr || toStr
      ? {
          date: {
            ...(fromStr ? { gte: dayOnly(fromStr) } : {}),
            ...(toStr ? { lte: dayOnly(toStr) } : {}),
          },
        }
      : {}),
  }

  const [counts, rows] = await Promise.all([
    prisma.attendance.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.attendance.findMany({
      where,
      orderBy: { date: "desc" },
      take: 365,
      select: { date: true, status: true, remark: true },
    }),
  ])

  const totals = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
  for (const c of counts) totals[c.status] = c._count._all
  const totalDays = totals.PRESENT + totals.ABSENT + totals.LATE + totals.EXCUSED
  const percent =
    totalDays === 0
      ? null
      : Math.round(((totals.PRESENT + totals.LATE * 0.5) / totalDays) * 100)

  return NextResponse.json({
    summary: { ...totals, totalDays, percent },
    items: rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      status: r.status,
      remark: r.remark,
    })),
  })
}
