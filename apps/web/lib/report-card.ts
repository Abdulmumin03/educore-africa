import { prisma } from "@/lib/db"
import { getGradingConfig, letterGradeFor, computePositions } from "@/lib/grade-config"

export type ReportCardData = {
  student: {
    id: string
    firstName: string
    middleName: string | null
    lastName: string
    admissionNumber: string
    dateOfBirth: string | null
    avatarUrl: string | null
    className: string
    sectionName: string
  }
  term: { id: string; type: string; sessionName: string; startDate: string; endDate: string }
  school: {
    name: string
    address: string | null
    phone: string | null
    email: string | null
    logoUrl: string | null
    motto: string | null
  }
  subjects: Array<{
    id: string
    name: string
    code: string
    waecCode: string | null
    ca: number
    exam: number
    total: number
    letterGrade: string | null
    waecGrade: string | null
    teacherRemark: string | null
    position: number | null
  }>
  totals: {
    total: number
    average: number
    overallPosition: number | null
    positionOutOf: number
  }
  attendance: { present: number; absent: number; late: number; excused: number; schoolDays: number; percent: number | null }
  classTeacherComment: string | null
  principalComment: string | null
  aiPrincipal: boolean
  reportCardId: string | null
  lockedAt: string | null
  nextTermBegins: string | null
  schoolFees: number | null
}

/**
 * Compute the full report-card data for a (student, term). Returns
 * `null` when the student isn't enrolled. Uses the existing Grade rows; does
 * NOT compute grades from scratch.
 */
export async function buildReportCardData(opts: {
  schoolId: string
  studentId: string
  termId: string
}): Promise<ReportCardData | null> {
  const [school, student, term, grades, attendance, reportCard, nextTerm, openInvoice] =
    await Promise.all([
      prisma.school.findUnique({
        where: { id: opts.schoolId },
        select: {
          name: true,
          address: true,
          phone: true,
          email: true,
          logoUrl: true,
          motto: true,
        },
      }),
      prisma.student.findFirst({
        where: { id: opts.studentId, schoolId: opts.schoolId, deletedAt: null },
        include: {
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
          enrollments: {
            where: { isActive: true, deletedAt: null },
            take: 1,
            include: { class: { select: { name: true } }, section: { select: { name: true, id: true, classId: true } } },
          },
        },
      }),
      prisma.term.findFirst({
        where: { id: opts.termId, academicYear: { schoolId: opts.schoolId } },
        include: { academicYear: { select: { name: true } } },
      }),
      prisma.grade.findMany({
        where: { studentId: opts.studentId, termId: opts.termId, deletedAt: null },
        include: { subject: true },
      }),
      prisma.attendance.groupBy({
        by: ["status"],
        where: { studentId: opts.studentId, termId: opts.termId, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.reportCard.findUnique({
        where: { studentId_termId: { studentId: opts.studentId, termId: opts.termId } },
      }),
      prisma.term.findFirst({
        where: {
          academicYear: { schoolId: opts.schoolId },
          startDate: { gt: new Date() },
        },
        orderBy: { startDate: "asc" },
      }),
      prisma.feeInvoice.findFirst({
        where: {
          studentId: opts.studentId,
          schoolId: opts.schoolId,
          termId: opts.termId,
          deletedAt: null,
        },
        select: { amountDue: true, amountPaid: true },
      }),
    ])

  if (!school || !student || !term || student.enrollments.length === 0) return null
  const enrollment = student.enrollments[0]

  const config = await getGradingConfig(opts.schoolId)

  // Per-student summary.
  const totals = grades.reduce(
    (acc, g) => {
      acc.total += g.totalScore
      acc.count += 1
      return acc
    },
    { total: 0, count: 0 },
  )
  const average = totals.count ? Math.round((totals.total / totals.count) * 10) / 10 : 0

  // Overall class position: average across all students in the same section + term.
  const sectionEnrollments = await prisma.enrollment.findMany({
    where: {
      sectionId: enrollment.section.id,
      isActive: true,
      deletedAt: null,
      student: { deletedAt: null },
    },
    select: { studentId: true },
  })
  const peerIds = sectionEnrollments.map((e) => e.studentId)
  const peerGrades = await prisma.grade.groupBy({
    by: ["studentId"],
    where: {
      studentId: { in: peerIds },
      termId: opts.termId,
      deletedAt: null,
    },
    _avg: { totalScore: true },
  })
  const overallRanking = computePositions(
    peerGrades
      .filter((p) => p._avg.totalScore !== null)
      .map((p) => ({ studentId: p.studentId, totalScore: Number(p._avg.totalScore ?? 0) })),
  )
  const overallPosition = overallRanking.get(student.id) ?? null

  // Attendance summary.
  const attTotals = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
  for (const a of attendance) attTotals[a.status] = a._count._all
  const schoolDays = attTotals.PRESENT + attTotals.ABSENT + attTotals.LATE + attTotals.EXCUSED
  const present = attTotals.PRESENT + attTotals.LATE
  const attendancePct = schoolDays === 0 ? null : Math.round(((attTotals.PRESENT + attTotals.LATE * 0.5) / schoolDays) * 100)

  return {
    student: {
      id: student.id,
      firstName: student.user.firstName,
      middleName: student.middleName,
      lastName: student.user.lastName,
      admissionNumber: student.admissionNumber,
      dateOfBirth: student.dateOfBirth ? student.dateOfBirth.toISOString() : null,
      avatarUrl: student.user.avatarUrl,
      className: enrollment.class.name,
      sectionName: enrollment.section.name,
    },
    term: {
      id: term.id,
      type: term.type,
      sessionName: term.academicYear.name,
      startDate: term.startDate.toISOString(),
      endDate: term.endDate.toISOString(),
    },
    school: {
      name: school.name,
      address: school.address,
      phone: school.phone,
      email: school.email,
      logoUrl: school.logoUrl,
      motto: school.motto,
    },
    subjects: grades
      .slice()
      .sort((a, b) => a.subject.name.localeCompare(b.subject.name))
      .map((g) => {
        const lg = g.letterGrade ?? letterGradeFor(g.totalScore, config.scale)?.grade ?? null
        return {
          id: g.subjectId,
          name: g.subject.name,
          code: g.subject.code,
          waecCode: g.subject.waecCode ?? null,
          ca: g.caScore,
          exam: g.examScore,
          total: g.totalScore,
          letterGrade: lg,
          waecGrade: lg, // 1:1 since the scale uses WAEC letters already
          teacherRemark: g.teacherRemark,
          position: g.position,
        }
      }),
    totals: {
      total: Math.round(totals.total * 10) / 10,
      average,
      overallPosition,
      positionOutOf: overallRanking.size,
    },
    attendance: {
      present: attTotals.PRESENT,
      absent: attTotals.ABSENT,
      late: attTotals.LATE,
      excused: attTotals.EXCUSED,
      schoolDays,
      percent: attendancePct,
    },
    classTeacherComment: reportCard?.classTeacherComment ?? null,
    principalComment: reportCard?.principalComment ?? null,
    aiPrincipal: reportCard?.aiPrincipal ?? false,
    reportCardId: reportCard?.id ?? null,
    lockedAt: reportCard?.lockedAt ? reportCard.lockedAt.toISOString() : null,
    nextTermBegins: nextTerm?.startDate.toISOString() ?? null,
    schoolFees: openInvoice
      ? Math.max(0, Number(openInvoice.amountDue) - Number(openInvoice.amountPaid))
      : null,
  }
}
