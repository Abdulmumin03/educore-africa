import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import {
  resolveAttendanceAccess,
  staffCanMarkSection,
} from "@/lib/attendance-access"
import {
  dayOnly,
  submitRollCallSchema,
} from "@/lib/attendance-schemas"
import { enqueueAttendanceJob } from "@/lib/queues/attendance.queue"

export const runtime = "nodejs"

/**
 * Submit a daily roll call. Upserts attendance rows per student, then enqueues
 * SMS/escalation jobs for absentees.
 */
export async function POST(req: Request) {
  const access = await resolveAttendanceAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = submitRollCallSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { classId, sectionId, date, entries } = parsed.data

  const ok = await staffCanMarkSection({
    schoolId: access.session.schoolId,
    staffId: access.teacherStaffId,
    sectionId,
    isPrivileged: access.isPrivileged,
  })
  if (!ok) return NextResponse.json({ error: "Not assigned to this section" }, { status: 403 })

  // Section must belong to this school + class.
  const section = await prisma.section.findFirst({
    where: { id: sectionId, schoolId: access.session.schoolId, classId, deletedAt: null },
    select: { id: true },
  })
  if (!section) return NextResponse.json({ error: "Invalid section" }, { status: 422 })

  const term = await prisma.term.findFirst({
    where: { isCurrent: true, academicYear: { schoolId: access.session.schoolId } },
    select: { id: true },
  })
  if (!term) return NextResponse.json({ error: "No active term" }, { status: 400 })

  const day = dayOnly(date)

  // Validate every student is actively enrolled in this section.
  const studentIds = entries.map((e) => e.studentId)
  const enrolled = await prisma.enrollment.findMany({
    where: {
      sectionId,
      studentId: { in: studentIds },
      isActive: true,
      deletedAt: null,
    },
    select: { studentId: true },
  })
  const enrolledSet = new Set(enrolled.map((e) => e.studentId))
  const invalid = studentIds.filter((id) => !enrolledSet.has(id))
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: "Some students are not enrolled in this section", invalid },
      { status: 422 },
    )
  }

  // Pull existing rows for this section+date so we know which ones flipped from
  // non-absent → absent (those need SMS even on re-submit).
  const existing = await prisma.attendance.findMany({
    where: { sectionId, date: day, studentId: { in: studentIds }, deletedAt: null },
    select: { studentId: true, status: true },
  })
  const prevStatus = new Map(existing.map((e) => [e.studentId, e.status]))

  await prisma.$transaction(
    entries.map((e) =>
      prisma.attendance.upsert({
        where: { studentId_date: { studentId: e.studentId, date: day } },
        create: {
          schoolId: access.session.schoolId,
          studentId: e.studentId,
          sectionId,
          termId: term.id,
          date: day,
          status: e.status,
          remark: e.remark || null,
          recordedBy: access.session.userId,
        },
        update: {
          sectionId,
          termId: term.id,
          status: e.status,
          remark: e.remark || null,
          recordedBy: access.session.userId,
        },
      }),
    ),
  )

  // Enqueue jobs for any student now marked ABSENT who wasn't already.
  const newlyAbsent = entries.filter(
    (e) => e.status === "ABSENT" && prevStatus.get(e.studentId) !== "ABSENT",
  )
  for (const e of newlyAbsent) {
    void enqueueAttendanceJob({ type: "absent-sms", studentId: e.studentId, date })
    void enqueueAttendanceJob({
      type: "consecutive-absence-check",
      studentId: e.studentId,
    })
    void enqueueAttendanceJob({
      type: "term-warning-check",
      studentId: e.studentId,
      termId: term.id,
    })
  }

  const counts = entries.reduce(
    (acc, e) => {
      acc[e.status] += 1
      return acc
    },
    { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 },
  )

  return NextResponse.json({
    ok: true,
    saved: entries.length,
    queued: newlyAbsent.length,
    counts,
  })
}

/**
 * List attendance for a class/section on a given date. Used by the roll-call UI
 * to pre-fill if it's already been marked, and by the reports/dashboard pages.
 */
export async function GET(req: Request) {
  const access = await resolveAttendanceAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const classId = url.searchParams.get("classId") ?? undefined
  const sectionId = url.searchParams.get("sectionId") ?? undefined
  const dateStr = url.searchParams.get("date")

  const day = dateStr ? dayOnly(dateStr) : dayOnly(new Date())

  const where: Prisma.AttendanceWhereInput = {
    schoolId: access.session.schoolId,
    deletedAt: null,
    date: day,
    ...(sectionId ? { sectionId } : {}),
    ...(classId && !sectionId ? { section: { classId } } : {}),
  }

  const rows = await prisma.attendance.findMany({
    where,
    orderBy: { student: { user: { lastName: "asc" } } },
    include: {
      student: {
        select: {
          id: true,
          admissionNumber: true,
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
        },
      },
    },
  })

  return NextResponse.json({
    date: day.toISOString().slice(0, 10),
    items: rows.map((r) => ({
      id: r.id,
      studentId: r.studentId,
      admissionNumber: r.student.admissionNumber,
      firstName: r.student.user.firstName,
      lastName: r.student.user.lastName,
      avatarUrl: r.student.user.avatarUrl,
      status: r.status,
      remark: r.remark,
    })),
  })
}
