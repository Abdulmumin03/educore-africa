import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveStaffAccess } from "@/lib/staff-access"

export const runtime = "nodejs"

function minutesBetween(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number)
  const [eh, em] = endTime.split(":").map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response

  const staff = await prisma.staff.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!staff) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const [subjects, sections, timetables, formSections] = await Promise.all([
    prisma.staffSubject.findMany({
      where: { staffId: staff.id },
      include: { subject: { select: { id: true, name: true, code: true, category: true } } },
    }),
    prisma.staffSectionAssignment.findMany({
      where: { staffId: staff.id },
      include: {
        section: { include: { class: { select: { name: true, level: true } } } },
        academicYear: { select: { name: true, isCurrent: true } },
        subject: { select: { name: true, code: true } },
      },
      orderBy: [{ academicYear: { isCurrent: "desc" } }, { section: { class: { level: "asc" } } }],
    }),
    prisma.timetable.findMany({
      where: { teacherId: staff.id, deletedAt: null },
      include: {
        subject: { select: { name: true, code: true } },
        class: { select: { name: true } },
        section: { select: { name: true } },
      },
    }),
    prisma.section.findMany({
      where: { teacherId: staff.id, deletedAt: null, schoolId: access.session.schoolId },
      include: { class: { select: { name: true } } },
    }),
  ])

  const totalMinutes = timetables.reduce(
    (acc, t) => acc + Math.max(0, minutesBetween(t.startTime, t.endTime)),
    0,
  )

  return NextResponse.json({
    subjects: subjects.map((s) => ({
      id: s.subject.id,
      name: s.subject.name,
      code: s.subject.code,
      category: s.subject.category,
    })),
    sections: sections.map((sa) => ({
      id: sa.id,
      className: sa.section.class.name,
      sectionName: sa.section.name,
      academicYearName: sa.academicYear.name,
      isCurrent: sa.academicYear.isCurrent,
      subjectName: sa.subject?.name ?? null,
    })),
    formTeacherOf: formSections.map((s) => ({
      className: s.class.name,
      sectionName: s.name,
    })),
    timetable: timetables.map((t) => ({
      id: t.id,
      dayOfWeek: t.dayOfWeek,
      startTime: t.startTime,
      endTime: t.endTime,
      subject: t.subject.name,
      className: t.class.name,
      sectionName: t.section.name,
      room: t.room,
    })),
    workload: {
      weeklyMinutes: totalMinutes,
      weeklyHours: Math.round((totalMinutes / 60) * 10) / 10,
      periodsPerWeek: timetables.length,
    },
  })
}
