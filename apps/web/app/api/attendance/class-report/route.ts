import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveAttendanceAccess } from "@/lib/attendance-access"
import { dayOnly } from "@/lib/attendance-schemas"

export const runtime = "nodejs"

/**
 * Per-class attendance breakdown over a date range (or current term if no
 * range provided). Returns every enrolled student with their status counts
 * and computed %.
 */
export async function GET(req: Request) {
  const access = await resolveAttendanceAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const sectionId = url.searchParams.get("sectionId")
  const fromStr = url.searchParams.get("from")
  const toStr = url.searchParams.get("to")
  if (!sectionId) return NextResponse.json({ error: "sectionId required" }, { status: 422 })

  const section = await prisma.section.findFirst({
    where: { id: sectionId, schoolId: access.session.schoolId, deletedAt: null },
    include: { class: { select: { name: true } } },
  })
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const from: Date | null = fromStr ? dayOnly(fromStr) : null
  const to: Date | null = toStr ? dayOnly(toStr) : null
  let termId: string | null = null
  // No user-supplied range → fall back to current term by termId only.
  // We don't also apply the term's date range as a filter — Attendance.termId
  // is canonical, and a stale isCurrent flag could otherwise exclude rows the
  // user just marked.
  if (!from && !to) {
    const term = await prisma.term.findFirst({
      where: { isCurrent: true, academicYear: { schoolId: access.session.schoolId } },
      select: { id: true },
    })
    termId = term?.id ?? null
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      sectionId,
      isActive: true,
      deletedAt: null,
      student: { deletedAt: null },
    },
    include: {
      student: {
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { student: { user: { lastName: "asc" } } },
  })

  const studentIds = enrollments.map((e) => e.student.id)
  const counts =
    studentIds.length === 0
      ? []
      : await prisma.attendance.groupBy({
          by: ["studentId", "status"],
          where: {
            schoolId: access.session.schoolId,
            sectionId,
            studentId: { in: studentIds },
            deletedAt: null,
            ...(termId ? { termId } : {}),
            ...(from || to
              ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
              : {}),
          },
          _count: { _all: true },
        })

  type Agg = { present: number; absent: number; late: number; excused: number }
  const map = new Map<string, Agg>()
  for (const r of counts) {
    const a = map.get(r.studentId) ?? { present: 0, absent: 0, late: 0, excused: 0 }
    if (r.status === "PRESENT") a.present += r._count._all
    if (r.status === "ABSENT") a.absent += r._count._all
    if (r.status === "LATE") a.late += r._count._all
    if (r.status === "EXCUSED") a.excused += r._count._all
    map.set(r.studentId, a)
  }

  const rows = enrollments.map((e) => {
    const a = map.get(e.student.id) ?? { present: 0, absent: 0, late: 0, excused: 0 }
    const total = a.present + a.absent + a.late + a.excused
    const percent = total === 0 ? null : Math.round(((a.present + a.late * 0.5) / total) * 100)
    return {
      studentId: e.student.id,
      admissionNumber: e.student.admissionNumber,
      firstName: e.student.user.firstName,
      lastName: e.student.user.lastName,
      present: a.present,
      absent: a.absent,
      late: a.late,
      excused: a.excused,
      totalDays: total,
      percent,
    }
  })

  return NextResponse.json({
    section: {
      id: section.id,
      name: section.name,
      className: section.class.name,
    },
    from: from?.toISOString().slice(0, 10) ?? null,
    to: to?.toISOString().slice(0, 10) ?? null,
    rows,
  })
}
