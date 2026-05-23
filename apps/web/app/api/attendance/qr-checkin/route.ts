import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import {
  resolveAttendanceAccess,
  staffCanMarkSection,
} from "@/lib/attendance-access"
import { dayOnly, qrCheckinSchema } from "@/lib/attendance-schemas"
import { findTermForDate } from "@/lib/term"

export const runtime = "nodejs"

/**
 * Mark a student PRESENT (or LATE if after 09:00 local) via a QR scan.
 * The caller must be a teacher with access to the student's section, or a
 * privileged role. Idempotent — re-scanning the same student updates remark
 * timestamp but doesn't reset status backwards.
 */
export async function POST(req: Request) {
  const access = await resolveAttendanceAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = qrCheckinSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 })

  const student = await prisma.student.findFirst({
    where: {
      id: parsed.data.studentId,
      schoolId: access.session.schoolId,
      deletedAt: null,
    },
    include: {
      user: { select: { firstName: true, lastName: true } },
      enrollments: {
        where: { isActive: true, deletedAt: null },
        take: 1,
        include: { section: { select: { id: true, classId: true } } },
      },
    },
  })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const enrollment = student.enrollments[0]
  if (!enrollment) {
    return NextResponse.json({ error: "Student not actively enrolled" }, { status: 409 })
  }

  const sectionId = parsed.data.sectionId ?? enrollment.section.id

  const ok = await staffCanMarkSection({
    schoolId: access.session.schoolId,
    staffId: access.teacherStaffId,
    sectionId,
    isPrivileged: access.isPrivileged,
  })
  if (!ok) return NextResponse.json({ error: "Not assigned to this section" }, { status: 403 })

  const day = parsed.data.date ? dayOnly(parsed.data.date) : dayOnly(new Date())
  const term = await findTermForDate(access.session.schoolId, day)
  if (!term) {
    return NextResponse.json(
      { error: "No term configured for this date" },
      { status: 400 },
    )
  }
  const now = new Date()

  // LATE if scanned after 09:00 local.
  const cutoff = new Date(day)
  cutoff.setHours(9, 0, 0, 0)
  const status = now.getTime() > cutoff.getTime() ? "LATE" : "PRESENT"

  const row = await prisma.attendance.upsert({
    where: { studentId_date: { studentId: student.id, date: day } },
    create: {
      schoolId: access.session.schoolId,
      studentId: student.id,
      sectionId,
      termId: term.id,
      date: day,
      status,
      remark: `QR check-in at ${now.toISOString().slice(11, 16)}`,
      recordedBy: access.session.userId,
    },
    update: {
      // Don't downgrade LATE → PRESENT on a re-scan within the same day.
      status: status === "LATE" ? "LATE" : undefined,
      remark: `QR check-in at ${now.toISOString().slice(11, 16)}`,
      recordedBy: access.session.userId,
    },
    select: { id: true, status: true },
  })

  return NextResponse.json({
    ok: true,
    id: row.id,
    status: row.status,
    student: {
      id: student.id,
      admissionNumber: student.admissionNumber,
      name: `${student.user.firstName} ${student.user.lastName}`,
    },
  })
}
