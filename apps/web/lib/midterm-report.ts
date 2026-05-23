import { prisma } from "@/lib/db"
import { resolveCurriculumForClass } from "@/lib/curriculum"

export type MidtermReportData = {
  student: {
    id: string
    firstName: string
    middleName: string | null
    lastName: string
    admissionNumber: string
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
  curriculum: {
    id: string | null
    code: string | null
    name: string | null
    examBodyCode: string
  }
  midtermComponents: string[]
  subjects: Array<{
    id: string
    name: string
    code: string
    externalCode: string | null
    components: Record<string, number | null>
    midtermTotal: number
    teacherRemark: string | null
  }>
  totals: {
    total: number
    average: number
    subjectCount: number
  }
  attendance: {
    present: number
    absent: number
    late: number
    excused: number
    schoolDays: number
    percent: number | null
  }
  classTeacherComment: string | null
  principalComment: string | null
  aiPrincipal: boolean
  midtermReportId: string | null
  lockedAt: string | null
}

/**
 * Build the midterm-report data for a (student, term). Returns `null` when the
 * student isn't enrolled. Scores are summed live from `Grade.caComponents`
 * using only the names listed in `Curriculum.midtermComponents` — no letter
 * grades, no positions, no curriculum-scale lookup. If the class's curriculum
 * has no midtermComponents configured, returns the row with `midtermTotal=0`
 * for every subject (the caller decides how to surface that).
 */
export async function buildMidtermReportData(opts: {
  schoolId: string
  studentId: string
  termId: string
}): Promise<MidtermReportData | null> {
  const [school, student, term, grades, attendance, midtermRow] = await Promise.all([
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
          include: {
            class: { select: { name: true } },
            section: { select: { name: true, id: true, classId: true } },
          },
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
    prisma.midtermReport.findUnique({
      where: { studentId_termId: { studentId: opts.studentId, termId: opts.termId } },
    }),
  ])

  if (!school || !student || !term || student.enrollments.length === 0) return null
  const enrollment = student.enrollments[0]

  const curriculum = await resolveCurriculumForClass(enrollment.section.classId)
  const midtermComponents = curriculum?.midtermComponents ?? []

  // External codes (e.g. WAEC 0540, IGCSE 0580) per subject under this class's curriculum.
  const subjectIds = grades.map((g) => g.subjectId)
  const externalCodeBySubjectId: Record<string, string | null> = {}
  if (curriculum && subjectIds.length > 0) {
    const rows = await prisma.subjectCurriculum.findMany({
      where: { curriculumId: curriculum.id, subjectId: { in: subjectIds } },
      select: { subjectId: true, externalCode: true },
    })
    for (const r of rows) externalCodeBySubjectId[r.subjectId] = r.externalCode
  }

  const subjects = grades
    .slice()
    .sort((a, b) => a.subject.name.localeCompare(b.subject.name))
    .map((g) => {
      const raw = (g.caComponents ?? null) as Record<string, number> | null
      const components: Record<string, number | null> = {}
      let midtermTotal = 0
      for (const name of midtermComponents) {
        const v = raw?.[name]
        if (typeof v === "number" && Number.isFinite(v)) {
          components[name] = v
          midtermTotal += v
        } else {
          components[name] = null
        }
      }
      return {
        id: g.subjectId,
        name: g.subject.name,
        code: g.subject.code,
        externalCode: externalCodeBySubjectId[g.subjectId] ?? null,
        components,
        midtermTotal: Math.round(midtermTotal * 10) / 10,
        teacherRemark: g.teacherRemark,
      }
    })

  const totalSum = subjects.reduce((acc, s) => acc + s.midtermTotal, 0)
  const subjectCount = subjects.length
  const average = subjectCount === 0 ? 0 : Math.round((totalSum / subjectCount) * 10) / 10

  const attTotals = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
  for (const a of attendance) attTotals[a.status] = a._count._all
  const schoolDays =
    attTotals.PRESENT + attTotals.ABSENT + attTotals.LATE + attTotals.EXCUSED
  const attendancePct =
    schoolDays === 0
      ? null
      : Math.round(((attTotals.PRESENT + attTotals.LATE * 0.5) / schoolDays) * 100)

  return {
    student: {
      id: student.id,
      firstName: student.user.firstName,
      middleName: student.middleName,
      lastName: student.user.lastName,
      admissionNumber: student.admissionNumber,
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
    curriculum: {
      id: curriculum?.id ?? null,
      code: curriculum?.code ?? null,
      name: curriculum?.name ?? null,
      examBodyCode: curriculum?.examBodyCode ?? "NONE",
    },
    midtermComponents,
    subjects,
    totals: {
      total: Math.round(totalSum * 10) / 10,
      average,
      subjectCount,
    },
    attendance: {
      present: attTotals.PRESENT,
      absent: attTotals.ABSENT,
      late: attTotals.LATE,
      excused: attTotals.EXCUSED,
      schoolDays,
      percent: attendancePct,
    },
    classTeacherComment: midtermRow?.classTeacherComment ?? null,
    principalComment: midtermRow?.principalComment ?? null,
    aiPrincipal: midtermRow?.aiPrincipal ?? false,
    midtermReportId: midtermRow?.id ?? null,
    lockedAt: midtermRow?.lockedAt ? midtermRow.lockedAt.toISOString() : null,
  }
}
