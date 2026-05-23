import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma, UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

const querySchema = z.object({
  classId: z.string().optional(),
  sectionId: z.string().optional(),
  teacherId: z.string().optional(),
  academicYearId: z.string().optional(),
  view: z.enum(["class", "teacher", "me"]).optional(),
})

const upsertSchema = z.object({
  id: z.string().cuid().optional(),
  academicYearId: z.string().cuid(),
  classId: z.string().cuid(),
  sectionId: z.string().cuid(),
  subjectId: z.string().cuid(),
  teacherId: z.string().cuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  room: z.string().max(40).nullable().optional(),
})

/**
 * GET /api/timetable
 *
 * Query (all optional):
 *   ?classId=…       → all sections of a class
 *   ?sectionId=…     → one section
 *   ?teacherId=…     → all slots taught by a teacher
 *   ?academicYearId  → defaults to school's current year
 *   ?view=me         → infer from session user (teacher → own, student → own section)
 *
 * Empty filter as STUDENT/TEACHER falls back to "view=me".
 * Empty filter as admin returns an empty slots list (admins must pick).
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    classId: url.searchParams.get("classId") ?? undefined,
    sectionId: url.searchParams.get("sectionId") ?? undefined,
    teacherId: url.searchParams.get("teacherId") ?? undefined,
    academicYearId: url.searchParams.get("academicYearId") ?? undefined,
    view: url.searchParams.get("view") ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 422 })
  }
  const q = parsed.data

  const schoolId = session.user.schoolId
  const academicYearId =
    q.academicYearId ??
    (await prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true, deletedAt: null },
      select: { id: true },
    }))?.id

  if (!academicYearId) {
    return NextResponse.json({ slots: [], periods: [], days: [], academicYearId: null })
  }

  // Build the where clause according to filters or user role.
  const where: Prisma.TimetableWhereInput = {
    schoolId,
    academicYearId,
  }

  if (q.sectionId) {
    where.sectionId = q.sectionId
  } else if (q.classId) {
    where.classId = q.classId
  } else if (q.teacherId) {
    where.teacherId = q.teacherId
  } else if (q.view === "me" || (!q.classId && !q.sectionId && !q.teacherId)) {
    // Infer from role
    if (session.user.role === "TEACHER") {
      const staff = await prisma.staff.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      })
      if (!staff) return NextResponse.json({ slots: [], periods: [], days: [], academicYearId })
      where.teacherId = staff.id
    } else if (session.user.role === "STUDENT") {
      const student = await prisma.student.findUnique({
        where: { userId: session.user.id },
        select: {
          enrollments: {
            where: { isActive: true, deletedAt: null },
            select: { sectionId: true },
            take: 1,
          },
        },
      })
      const sectionId = student?.enrollments[0]?.sectionId
      if (!sectionId) return NextResponse.json({ slots: [], periods: [], days: [], academicYearId })
      where.sectionId = sectionId
    } else if (session.user.role === "PARENT") {
      const parent = await prisma.parent.findUnique({
        where: { userId: session.user.id },
        select: {
          students: {
            select: {
              student: {
                select: {
                  enrollments: {
                    where: { isActive: true, deletedAt: null },
                    select: { sectionId: true },
                    take: 1,
                  },
                },
              },
            },
            take: 1,
          },
        },
      })
      const sectionId = parent?.students[0]?.student.enrollments[0]?.sectionId
      if (!sectionId) return NextResponse.json({ slots: [], periods: [], days: [], academicYearId })
      where.sectionId = sectionId
    } else {
      // Admin with no filter — return empty until they pick
      return NextResponse.json({ slots: [], periods: [], days: [], academicYearId })
    }
  }

  const rows = await prisma.timetable.findMany({
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
  })

  // Distinct periods (startTime, endTime), sorted.
  const periodSet = new Map<string, { startTime: string; endTime: string }>()
  for (const r of rows) {
    periodSet.set(r.startTime, { startTime: r.startTime, endTime: r.endTime })
  }
  const periods = Array.from(periodSet.values()).sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  )

  // Distinct days actually present in the data.
  const dayOfWeekSet = new Set<number>()
  for (const r of rows) dayOfWeekSet.add(r.dayOfWeek)

  // If we still have no rows, infer the school's working days from settings.
  let days = Array.from(dayOfWeekSet).sort((a, b) => a - b)
  if (days.length === 0) {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { settings: true },
    })
    const settings = (school?.settings ?? {}) as { workingDays?: number[] }
    days = Array.isArray(settings.workingDays) && settings.workingDays.length
      ? settings.workingDays
      : [1, 2, 3, 4, 5]
  }

  // Detect teacher double-bookings affecting any teacher in the returned set,
  // looking at ALL active slots in the school/year (not just the filtered view).
  const teacherIds = Array.from(new Set(rows.map((r) => r.teacherId)))
  const conflictSlotIds = new Set<string>()
  if (teacherIds.length > 0) {
    const peers = await prisma.timetable.findMany({
      where: {
        schoolId,
        academicYearId,
        teacherId: { in: teacherIds },
        deletedAt: null,
      },
      select: { id: true, teacherId: true, dayOfWeek: true, startTime: true },
    })
    const groups = new Map<string, string[]>()
    for (const p of peers) {
      const key = `${p.teacherId}-${p.dayOfWeek}-${p.startTime}`
      const list = groups.get(key) ?? []
      list.push(p.id)
      groups.set(key, list)
    }
    groups.forEach((ids) => {
      if (ids.length > 1) for (const id of ids) conflictSlotIds.add(id)
    })
  }

  return NextResponse.json({
    academicYearId,
    days,
    periods,
    conflicts: Array.from(conflictSlotIds),
    slots: rows.map((r) => ({
      id: r.id,
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      room: r.room,
      subject: r.subject,
      teacher: {
        id: r.teacher.id,
        firstName: r.teacher.user.firstName,
        lastName: r.teacher.user.lastName,
        initials: `${r.teacher.user.firstName.charAt(0)}${r.teacher.user.lastName.charAt(0)}`.toUpperCase(),
      },
      class: r.class,
      section: r.section,
    })),
  })
}

/**
 * POST /api/timetable — upsert a single slot. Admin only.
 *
 * If `id` is provided, updates that row. Otherwise creates a new row.
 * Honours the unique constraint (sectionId, dayOfWeek, startTime).
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!ADMIN_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = upsertSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data
  const schoolId = session.user.schoolId

  // Cross-check FKs belong to this school.
  const [section, subject, teacher, year] = await Promise.all([
    prisma.section.findFirst({
      where: { id: data.sectionId, classId: data.classId, schoolId, deletedAt: null },
      select: { id: true },
    }),
    prisma.subject.findFirst({
      where: { id: data.subjectId, schoolId, deletedAt: null },
      select: { id: true },
    }),
    prisma.staff.findFirst({
      where: { id: data.teacherId, schoolId, deletedAt: null },
      select: { id: true },
    }),
    prisma.academicYear.findFirst({
      where: { id: data.academicYearId, schoolId, deletedAt: null },
      select: { id: true },
    }),
  ])
  if (!section) return NextResponse.json({ error: "Invalid section/class" }, { status: 422 })
  if (!subject) return NextResponse.json({ error: "Invalid subject" }, { status: 422 })
  if (!teacher) return NextResponse.json({ error: "Invalid teacher" }, { status: 422 })
  if (!year) return NextResponse.json({ error: "Invalid academic year" }, { status: 422 })

  try {
    const row = data.id
      ? await prisma.timetable.update({
          where: { id: data.id },
          data: {
            classId: data.classId,
            sectionId: data.sectionId,
            subjectId: data.subjectId,
            teacherId: data.teacherId,
            dayOfWeek: data.dayOfWeek,
            startTime: data.startTime,
            endTime: data.endTime,
            room: data.room ?? null,
          },
          select: { id: true },
        })
      : await prisma.timetable.create({
          data: {
            schoolId,
            academicYearId: data.academicYearId,
            classId: data.classId,
            sectionId: data.sectionId,
            subjectId: data.subjectId,
            teacherId: data.teacherId,
            dayOfWeek: data.dayOfWeek,
            startTime: data.startTime,
            endTime: data.endTime,
            room: data.room ?? null,
          },
          select: { id: true },
        })

    return NextResponse.json({ ok: true, id: row.id })
  } catch (err) {
    if (err instanceof Error && /Unique constraint/i.test(err.message)) {
      return NextResponse.json(
        { error: "Another slot already exists at that time for this section." },
        { status: 409 },
      )
    }
    throw err
  }
}
