import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveAttendanceAccess } from "@/lib/attendance-access"
import { dayOnly } from "@/lib/attendance-schemas"

export const runtime = "nodejs"

/**
 * List sections (class + arm) that have at least one active student enrolled
 * but no attendance rows for today.
 */
export async function GET(req: Request) {
  const access = await resolveAttendanceAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const dateStr = url.searchParams.get("date")
  const day = dateStr ? dayOnly(dateStr) : dayOnly(new Date())

  // Sections with at least one active enrollment.
  const sections = await prisma.section.findMany({
    where: {
      schoolId: access.session.schoolId,
      deletedAt: null,
      enrollments: { some: { isActive: true, deletedAt: null } },
    },
    include: {
      class: { select: { name: true, level: true } },
      teacher: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      _count: {
        select: {
          enrollments: { where: { isActive: true, deletedAt: null } },
          attendance: { where: { date: day, deletedAt: null } },
        },
      },
    },
    orderBy: [{ class: { level: "asc" } }, { name: "asc" }],
  })

  const pending = sections.filter((s) => s._count.attendance === 0)

  return NextResponse.json({
    date: day.toISOString().slice(0, 10),
    pendingCount: pending.length,
    sectionsTotal: sections.length,
    items: pending.map((s) => ({
      sectionId: s.id,
      classId: s.classId,
      className: s.class.name,
      sectionName: s.name,
      enrolledCount: s._count.enrollments,
      formTeacher: s.teacher
        ? `${s.teacher.user.firstName} ${s.teacher.user.lastName}`
        : null,
    })),
  })
}
