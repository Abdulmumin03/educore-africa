import { z } from "zod"
import type { Prisma, UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { renderTimetablePdf, type TimetablePdfSlot } from "@/lib/timetable-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

const querySchema = z.object({
  classId: z.string().optional(),
  sectionId: z.string().optional(),
  teacherId: z.string().optional(),
  academicYearId: z.string().optional(),
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return new Response("Unauthorized", { status: 401 })
  if (!session.user.schoolId) return new Response("No school context", { status: 400 })

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    classId: url.searchParams.get("classId") ?? undefined,
    sectionId: url.searchParams.get("sectionId") ?? undefined,
    teacherId: url.searchParams.get("teacherId") ?? undefined,
    academicYearId: url.searchParams.get("academicYearId") ?? undefined,
  })
  if (!parsed.success) return new Response("Invalid query", { status: 422 })
  const q = parsed.data

  const schoolId = session.user.schoolId
  const role = session.user.role

  const academicYearId =
    q.academicYearId ??
    (await prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true, deletedAt: null },
      select: { id: true },
    }))?.id

  if (!academicYearId) return new Response("No current academic year", { status: 404 })

  const where: Prisma.TimetableWhereInput = { schoolId, academicYearId, deletedAt: null }

  // Self-serve: students/teachers without filters only get their own.
  let scopeLabel = "All classes"
  if (q.sectionId) {
    where.sectionId = q.sectionId
    const sec = await prisma.section.findFirst({
      where: { id: q.sectionId, schoolId },
      select: { name: true, class: { select: { name: true } } },
    })
    scopeLabel = sec ? `${sec.class.name} · Arm ${sec.name}` : "Section"
  } else if (q.classId) {
    where.classId = q.classId
    const cls = await prisma.class.findFirst({
      where: { id: q.classId, schoolId },
      select: { name: true },
    })
    scopeLabel = cls?.name ?? "Class"
  } else if (q.teacherId) {
    if (!ADMIN_ROLES.includes(role) && role !== "TEACHER") {
      return new Response("Forbidden", { status: 403 })
    }
    where.teacherId = q.teacherId
    const t = await prisma.staff.findFirst({
      where: { id: q.teacherId, schoolId },
      select: { user: { select: { firstName: true, lastName: true } } },
    })
    scopeLabel = t ? `${t.user.firstName} ${t.user.lastName}` : "Teacher"
  } else if (role === "TEACHER") {
    const staff = await prisma.staff.findUnique({
      where: { userId: session.user.id },
      select: { id: true, user: { select: { firstName: true, lastName: true } } },
    })
    if (!staff) return new Response("Not a staff member", { status: 404 })
    where.teacherId = staff.id
    scopeLabel = `${staff.user.firstName} ${staff.user.lastName}`
  } else if (role === "STUDENT") {
    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: {
        enrollments: {
          where: { isActive: true, deletedAt: null },
          select: {
            sectionId: true,
            section: { select: { name: true, class: { select: { name: true } } } },
          },
          take: 1,
        },
      },
    })
    const e = student?.enrollments[0]
    if (!e) return new Response("No active enrolment", { status: 404 })
    where.sectionId = e.sectionId
    scopeLabel = `${e.section.class.name} · Arm ${e.section.name}`
  } else {
    return new Response("Pick a class, section, or teacher", { status: 400 })
  }

  const [school, year, rows] = await Promise.all([
    prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true, address: true, logoUrl: true, settings: true },
    }),
    prisma.academicYear.findFirst({
      where: { id: academicYearId },
      select: { name: true },
    }),
    prisma.timetable.findMany({
      where,
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      include: {
        subject: { select: { id: true, name: true, code: true } },
        teacher: {
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
      },
    }),
  ])

  const slots: TimetablePdfSlot[] = rows.map((r) => ({
    id: r.id,
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime,
    endTime: r.endTime,
    room: r.room,
    subject: r.subject,
    teacher: {
      firstName: r.teacher.user.firstName,
      lastName: r.teacher.user.lastName,
      initials: `${r.teacher.user.firstName.charAt(0)}${r.teacher.user.lastName.charAt(0)}`.toUpperCase(),
    },
    class: r.class,
    section: r.section,
  }))

  const periodSet = new Map<string, { startTime: string; endTime: string }>()
  for (const r of rows) periodSet.set(r.startTime, { startTime: r.startTime, endTime: r.endTime })
  const periods = Array.from(periodSet.values()).sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  )

  const daySet = new Set<number>()
  for (const r of rows) daySet.add(r.dayOfWeek)
  let days = Array.from(daySet).sort((a, b) => a - b)
  if (days.length === 0) {
    const settings = (school?.settings ?? {}) as { workingDays?: number[] }
    days = Array.isArray(settings.workingDays) && settings.workingDays.length
      ? settings.workingDays
      : [1, 2, 3, 4, 5]
  }

  const pdf = await renderTimetablePdf({
    schoolName: school?.name ?? "School",
    schoolAddress: school?.address ?? null,
    schoolLogoUrl: school?.logoUrl ?? null,
    scopeLabel,
    academicYearLabel: year?.name ?? null,
    days,
    periods,
    slots,
    generatedAt: new Date(),
  })

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="timetable.pdf"`,
    },
  })
}
