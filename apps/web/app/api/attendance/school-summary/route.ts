import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveAttendanceAccess } from "@/lib/attendance-access"
import { dayOnly } from "@/lib/attendance-schemas"

export const runtime = "nodejs"

/**
 * School-wide attendance summary for a given day (defaults to today).
 * Also returns the top 5 most-absent students in the current term.
 */
export async function GET(req: Request) {
  const access = await resolveAttendanceAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const dateStr = url.searchParams.get("date")
  const day = dateStr ? dayOnly(dateStr) : dayOnly(new Date())

  const term = await prisma.term.findFirst({
    where: { isCurrent: true, academicYear: { schoolId: access.session.schoolId } },
    select: { id: true, type: true, startDate: true, endDate: true, academicYear: { select: { name: true } } },
  })

  const [todayCounts, totalStudents, topAbsent] = await Promise.all([
    prisma.attendance.groupBy({
      by: ["status"],
      where: { schoolId: access.session.schoolId, date: day, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.student.count({
      where: { schoolId: access.session.schoolId, deletedAt: null, status: "ACTIVE" },
    }),
    term
      ? prisma.attendance.groupBy({
          by: ["studentId"],
          where: {
            schoolId: access.session.schoolId,
            termId: term.id,
            status: "ABSENT",
            deletedAt: null,
          },
          _count: { _all: true },
          orderBy: { _count: { studentId: "desc" } },
          take: 5,
        })
      : Promise.resolve([]),
  ])

  const totals = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
  for (const c of todayCounts) totals[c.status] = c._count._all
  const marked = totals.PRESENT + totals.ABSENT + totals.LATE + totals.EXCUSED
  const percent =
    marked === 0 ? null : Math.round(((totals.PRESENT + totals.LATE * 0.5) / marked) * 100)

  let topAbsentEnriched: Array<{
    studentId: string
    firstName: string
    lastName: string
    admissionNumber: string
    avatarUrl: string | null
    absences: number
    className: string | null
    sectionName: string | null
  }> = []
  if (topAbsent.length > 0) {
    const students = await prisma.student.findMany({
      where: { id: { in: topAbsent.map((t) => t.studentId) } },
      include: {
        user: { select: { firstName: true, lastName: true, avatarUrl: true } },
        enrollments: {
          where: { isActive: true, deletedAt: null },
          take: 1,
          include: { class: { select: { name: true } }, section: { select: { name: true } } },
        },
      },
    })
    const map = new Map(students.map((s) => [s.id, s]))
    topAbsentEnriched = topAbsent
      .map((t) => {
        const s = map.get(t.studentId)
        if (!s) return null
        return {
          studentId: s.id,
          firstName: s.user.firstName,
          lastName: s.user.lastName,
          admissionNumber: s.admissionNumber,
          avatarUrl: s.user.avatarUrl,
          absences: t._count._all,
          className: s.enrollments[0]?.class.name ?? null,
          sectionName: s.enrollments[0]?.section.name ?? null,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }

  return NextResponse.json({
    date: day.toISOString().slice(0, 10),
    totalActiveStudents: totalStudents,
    today: {
      ...totals,
      marked,
      unmarked: Math.max(0, totalStudents - marked),
      percent,
    },
    term: term
      ? {
          id: term.id,
          type: term.type,
          sessionName: term.academicYear.name,
          startDate: term.startDate.toISOString(),
          endDate: term.endDate.toISOString(),
        }
      : null,
    topAbsentThisTerm: topAbsentEnriched,
  })
}
