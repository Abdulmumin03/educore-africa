import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveAttendanceAccess } from "@/lib/attendance-access"
import { dayOnly } from "@/lib/attendance-schemas"

export const runtime = "nodejs"

/**
 * Return the active roster for a section, with any existing attendance for
 * the given date pre-filled. Powers the roll-call UI.
 */
export async function GET(req: Request) {
  const access = await resolveAttendanceAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const sectionId = url.searchParams.get("sectionId")
  const dateStr = url.searchParams.get("date")
  if (!sectionId) return NextResponse.json({ error: "sectionId required" }, { status: 422 })

  const day = dateStr ? dayOnly(dateStr) : dayOnly(new Date())

  const section = await prisma.section.findFirst({
    where: { id: sectionId, schoolId: access.session.schoolId, deletedAt: null },
    include: { class: { select: { name: true } } },
  })
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const enrollments = await prisma.enrollment.findMany({
    where: {
      sectionId,
      isActive: true,
      deletedAt: null,
      student: { deletedAt: null, status: "ACTIVE" },
    },
    include: {
      student: {
        include: {
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
        },
      },
    },
    orderBy: { student: { user: { lastName: "asc" } } },
  })

  const existing = await prisma.attendance.findMany({
    where: { sectionId, date: day, deletedAt: null },
    select: { studentId: true, status: true, remark: true },
  })
  const byStudent = new Map(existing.map((e) => [e.studentId, e]))

  return NextResponse.json({
    section: {
      id: section.id,
      name: section.name,
      className: section.class.name,
      classId: section.classId,
    },
    date: day.toISOString().slice(0, 10),
    alreadyMarked: existing.length > 0,
    students: enrollments.map((e) => {
      const prior = byStudent.get(e.student.id)
      return {
        studentId: e.student.id,
        admissionNumber: e.student.admissionNumber,
        firstName: e.student.user.firstName,
        lastName: e.student.user.lastName,
        avatarUrl: e.student.user.avatarUrl,
        status: prior?.status ?? "PRESENT",
        remark: prior?.remark ?? "",
      }
    }),
  })
}
