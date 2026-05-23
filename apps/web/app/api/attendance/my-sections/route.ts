import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveAttendanceAccess } from "@/lib/attendance-access"

export const runtime = "nodejs"

/**
 * Sections the current user can mark attendance for:
 *   - Privileged roles (admin/principal): every section in the school
 *   - Teachers: form-teacher of, OR have a section assignment, OR have a
 *     timetable row teaching that section
 */
export async function GET() {
  const access = await resolveAttendanceAccess()
  if (!access.ok) return access.response

  let sectionIds: string[] | null = null

  if (!access.isPrivileged) {
    if (!access.teacherStaffId) {
      return NextResponse.json({ items: [] })
    }
    const [form, assignments, timetables] = await Promise.all([
      prisma.section.findMany({
        where: {
          schoolId: access.session.schoolId,
          teacherId: access.teacherStaffId,
          deletedAt: null,
        },
        select: { id: true },
      }),
      prisma.staffSectionAssignment.findMany({
        where: { staffId: access.teacherStaffId },
        select: { sectionId: true },
      }),
      prisma.timetable.findMany({
        where: { teacherId: access.teacherStaffId, deletedAt: null },
        select: { sectionId: true },
      }),
    ])
    const set = new Set<string>()
    form.forEach((s) => set.add(s.id))
    assignments.forEach((a) => set.add(a.sectionId))
    timetables.forEach((t) => set.add(t.sectionId))
    sectionIds = Array.from(set)
    if (sectionIds.length === 0) return NextResponse.json({ items: [] })
  }

  const sections = await prisma.section.findMany({
    where: {
      schoolId: access.session.schoolId,
      deletedAt: null,
      ...(sectionIds ? { id: { in: sectionIds } } : {}),
    },
    include: {
      class: { select: { id: true, name: true, level: true } },
      _count: { select: { enrollments: { where: { isActive: true, deletedAt: null } } } },
    },
    orderBy: [{ class: { level: "asc" } }, { name: "asc" }],
  })

  // Group by class for the smart selector.
  const byClass = new Map<
    string,
    { id: string; name: string; sections: Array<{ id: string; name: string; enrolled: number }> }
  >()
  for (const s of sections) {
    const key = s.class.id
    if (!byClass.has(key)) byClass.set(key, { id: key, name: s.class.name, sections: [] })
    byClass.get(key)!.sections.push({ id: s.id, name: s.name, enrolled: s._count.enrollments })
  }

  return NextResponse.json({ items: Array.from(byClass.values()) })
}
