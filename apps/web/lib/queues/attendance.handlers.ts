import { prisma } from "@/lib/db"
import { sendSms } from "@/lib/sms"
import type { AttendanceJob } from "@/lib/queues/attendance.queue"

const CONSECUTIVE_ABSENCES_TRIGGER = 3
const TERM_WARNING_THRESHOLD = 0.75
const SMS_HELPLINE = process.env.SCHOOL_HELPLINE ?? "+234-XXX"

async function handleAbsentSms(studentId: string, date: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      schoolId: true,
      user: { select: { firstName: true, lastName: true } },
      school: { select: { name: true } },
      parents: {
        where: { isPrimary: true },
        include: {
          parent: { include: { user: { select: { phone: true, id: true } } } },
        },
      },
    },
  })
  if (!student) return

  const primary = student.parents[0]?.parent
  if (!primary?.user.phone) {
    console.warn("[attendance/handlers] no primary guardian phone for", studentId)
    return
  }

  const fullName = `${student.user.firstName} ${student.user.lastName}`
  const dateLabel = new Date(date).toLocaleDateString("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
  const message =
    `Dear Parent, your child ${fullName} was absent from ${student.school.name} today, ${dateLabel}. ` +
    `Please call ${SMS_HELPLINE} if you need to inform the school.`

  await sendSms(primary.user.phone, message)
  await prisma.notification.create({
    data: {
      schoolId: student.schoolId,
      userId: primary.user.id,
      channel: "SMS",
      title: "Absence alert",
      body: message,
      metadata: { studentId, date },
      sentAt: new Date(),
    },
  })
}

async function handleConsecutiveAbsenceCheck(studentId: string) {
  const recent = await prisma.attendance.findMany({
    where: { studentId, deletedAt: null },
    orderBy: { date: "desc" },
    take: CONSECUTIVE_ABSENCES_TRIGGER,
    select: { status: true, date: true },
  })
  if (recent.length < CONSECUTIVE_ABSENCES_TRIGGER) return
  if (!recent.every((r) => r.status === "ABSENT")) return

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      schoolId: true,
      user: { select: { firstName: true, lastName: true } },
      enrollments: {
        where: { isActive: true, deletedAt: null },
        take: 1,
        include: { class: { select: { name: true } }, section: { select: { name: true } } },
      },
    },
  })
  if (!student) return

  const fullName = `${student.user.firstName} ${student.user.lastName}`
  const enrolment = student.enrollments[0]
  const where = enrolment ? `${enrolment.class.name} · Arm ${enrolment.section.name}` : "school"

  const principals = await prisma.user.findMany({
    where: {
      schoolId: student.schoolId,
      role: { in: ["PRINCIPAL", "SCHOOL_ADMIN"] },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, phone: true },
  })

  const body = `${fullName} (${where}) has been absent ${CONSECUTIVE_ABSENCES_TRIGGER} days in a row. Please follow up.`

  for (const p of principals) {
    if (p.phone) void sendSms(p.phone, body)
    await prisma.notification.create({
      data: {
        schoolId: student.schoolId,
        userId: p.id,
        channel: "IN_APP",
        title: "Consecutive absences",
        body,
        metadata: { studentId, days: CONSECUTIVE_ABSENCES_TRIGGER },
        sentAt: new Date(),
      },
    })
  }
}

async function handleTermWarningCheck(studentId: string, termId: string) {
  const counts = await prisma.attendance.groupBy({
    by: ["status"],
    where: { studentId, termId, deletedAt: null },
    _count: { _all: true },
  })
  const totals = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
  for (const c of counts) totals[c.status] = c._count._all
  const totalDays = totals.PRESENT + totals.ABSENT + totals.LATE + totals.EXCUSED
  if (totalDays < 5) return
  const pct = (totals.PRESENT + totals.LATE * 0.5) / totalDays
  if (pct >= TERM_WARNING_THRESHOLD) return

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      schoolId: true,
      user: { select: { firstName: true, lastName: true } },
      school: { select: { name: true } },
      parents: {
        where: { isPrimary: true },
        include: { parent: { include: { user: { select: { phone: true, id: true } } } } },
      },
    },
  })
  if (!student) return
  const primary = student.parents[0]?.parent
  if (!primary) return

  const fullName = `${student.user.firstName} ${student.user.lastName}`
  const message =
    `Dear Parent, ${fullName}'s attendance at ${student.school.name} has dropped to ${Math.round(pct * 100)}% ` +
    `this term, below the 75% minimum. Please contact the school to discuss.`

  if (primary.user.phone) await sendSms(primary.user.phone, message)
  await prisma.notification.create({
    data: {
      schoolId: student.schoolId,
      userId: primary.user.id,
      channel: "SMS",
      title: "Term attendance warning",
      body: message,
      metadata: { studentId, termId, percent: pct },
      sentAt: new Date(),
    },
  })
}

/**
 * Dispatch a single attendance job. Called by the BullMQ worker (per job) AND
 * by the queue producer when running in inline-dispatch mode.
 */
export async function runAttendanceJob(job: AttendanceJob): Promise<void> {
  switch (job.type) {
    case "absent-sms":
      return handleAbsentSms(job.studentId, job.date)
    case "consecutive-absence-check":
      return handleConsecutiveAbsenceCheck(job.studentId)
    case "term-warning-check":
      return handleTermWarningCheck(job.studentId, job.termId)
  }
}
