import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveGradeAccess } from "@/lib/grade-access"
import { resolveCurriculumForClass, getDefaultCurriculum } from "@/lib/curriculum"

export const runtime = "nodejs"

/**
 * GET /api/grades/midterm-reports?classId=X&sectionId=Y&termId=Z
 *
 * Roster + midterm averages for the dashboard list view. Computes scores
 * live by summing only the curriculum's `midtermComponents` from each
 * Grade.caComponents. Also surfaces row-level state (rowId, lockedAt,
 * whether comments are set) so the UI can show locked/unlocked badges.
 */
export async function GET(req: Request) {
  const access = await resolveGradeAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const classId = url.searchParams.get("classId")
  const sectionId = url.searchParams.get("sectionId")
  const termId = url.searchParams.get("termId")
  if (!termId || (!classId && !sectionId)) {
    return NextResponse.json(
      { error: "termId and (classId or sectionId) required" },
      { status: 422 },
    )
  }

  // Curriculum drives which CA component names sum into the midterm total.
  let resolvedClassId = classId
  if (!resolvedClassId && sectionId) {
    const section = await prisma.section.findFirst({
      where: { id: sectionId, schoolId: access.session.schoolId, deletedAt: null },
      select: { classId: true },
    })
    resolvedClassId = section?.classId ?? null
  }
  const curriculum = resolvedClassId
    ? await resolveCurriculumForClass(resolvedClassId)
    : await getDefaultCurriculum(access.session.schoolId)
  const midtermComponents = curriculum?.midtermComponents ?? []

  const enrollments = await prisma.enrollment.findMany({
    where: {
      schoolId: access.session.schoolId,
      isActive: true,
      deletedAt: null,
      student: { status: "ACTIVE", deletedAt: null },
      ...(sectionId ? { sectionId } : { section: { classId: classId! } }),
    },
    include: {
      student: {
        select: {
          id: true,
          admissionNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
    orderBy: { student: { user: { lastName: "asc" } } },
  })

  const studentIds = enrollments.map((e) => e.student.id)

  // Pull every grade row for these students in this term — we only need the
  // caComponents JSON to sum locally.
  const [grades, midtermRows] = await Promise.all([
    studentIds.length === 0
      ? Promise.resolve(
          [] as Array<{ studentId: string; caComponents: unknown }>,
        )
      : prisma.grade.findMany({
          where: {
            studentId: { in: studentIds },
            termId,
            deletedAt: null,
          },
          select: { studentId: true, caComponents: true },
        }),
    studentIds.length === 0
      ? Promise.resolve(
          [] as Array<{
            id: string
            studentId: string
            lockedAt: Date | null
            classTeacherComment: string | null
            principalComment: string | null
          }>,
        )
      : prisma.midtermReport.findMany({
          where: { studentId: { in: studentIds }, termId, deletedAt: null },
          select: {
            id: true,
            studentId: true,
            lockedAt: true,
            classTeacherComment: true,
            principalComment: true,
          },
        }),
  ])

  // Aggregate per student.
  type Aggregate = { sum: number; subjects: number }
  const aggByStudent = new Map<string, Aggregate>()
  for (const g of grades) {
    const ca = g.caComponents as Record<string, number> | null
    let midTotal = 0
    let any = false
    for (const name of midtermComponents) {
      const v = ca?.[name]
      if (typeof v === "number" && Number.isFinite(v)) {
        midTotal += v
        any = true
      }
    }
    // A subject counts toward the average only if at least one midterm
    // component has a recorded score; otherwise it's "not entered yet".
    if (any) {
      const existing = aggByStudent.get(g.studentId) ?? { sum: 0, subjects: 0 }
      existing.sum += midTotal
      existing.subjects += 1
      aggByStudent.set(g.studentId, existing)
    }
  }

  const rowByStudent = new Map(midtermRows.map((r) => [r.studentId, r]))

  const ranking = enrollments.map((e) => {
    const agg = aggByStudent.get(e.student.id) ?? { sum: 0, subjects: 0 }
    const total = Math.round(agg.sum * 10) / 10
    const average = agg.subjects === 0 ? null : Math.round((agg.sum / agg.subjects) * 10) / 10
    const row = rowByStudent.get(e.student.id) ?? null
    return {
      studentId: e.student.id,
      name: `${e.student.user.firstName} ${e.student.user.lastName}`,
      admissionNumber: e.student.admissionNumber,
      className: e.class.name,
      sectionName: e.section.name,
      total,
      average,
      midtermReportId: row?.id ?? null,
      lockedAt: row?.lockedAt ? row.lockedAt.toISOString() : null,
      hasClassTeacherComment: !!row?.classTeacherComment,
      hasPrincipalComment: !!row?.principalComment,
    }
  })

  return NextResponse.json({
    midtermComponents,
    curriculumCode: curriculum?.code ?? null,
    curriculumName: curriculum?.name ?? null,
    ranking,
  })
}
