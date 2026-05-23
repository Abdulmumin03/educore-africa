import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { resolveGradeAccess, teacherCanGrade } from "@/lib/grade-access"
import {
  getGradingConfig,
  letterGradeFor,
  totalCaFrom,
  computePositions,
} from "@/lib/grade-config"
import { bulkGradesSchema } from "@/lib/grade-schemas"

export const runtime = "nodejs"

/**
 * Grade matrix for one (class|section, subject, term). Returns the active
 * roster + each student's existing grade row (if any), plus the grading
 * config so the spreadsheet UI can render component columns.
 */
export async function GET(req: Request) {
  const access = await resolveGradeAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const classId = url.searchParams.get("classId")
  const sectionId = url.searchParams.get("sectionId")
  const termId = url.searchParams.get("termId")
  const subjectId = url.searchParams.get("subjectId")
  if (!termId || !subjectId || (!classId && !sectionId)) {
    return NextResponse.json(
      { error: "termId, subjectId, and classId (or sectionId) are required" },
      { status: 422 },
    )
  }

  const [section, subject, term, config] = await Promise.all([
    sectionId
      ? prisma.section.findFirst({
          where: { id: sectionId, schoolId: access.session.schoolId, deletedAt: null },
          include: { class: true },
        })
      : Promise.resolve(null),
    prisma.subject.findFirst({
      where: { id: subjectId, schoolId: access.session.schoolId, deletedAt: null },
    }),
    prisma.term.findFirst({
      where: { id: termId, academicYear: { schoolId: access.session.schoolId } },
      include: { academicYear: { select: { name: true } } },
    }),
    getGradingConfig(access.session.schoolId),
  ])
  if (!subject || !term) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Resolve all sections under the class if no specific section was given.
  const sectionFilter: Prisma.EnrollmentWhereInput["sectionId"] = sectionId
    ? sectionId
    : { in: await prisma.section.findMany({
        where: { schoolId: access.session.schoolId, classId: classId!, deletedAt: null },
        select: { id: true },
      }).then((rows) => rows.map((r) => r.id)) }

  const [enrollments, grades] = await Promise.all([
    prisma.enrollment.findMany({
      where: {
        schoolId: access.session.schoolId,
        sectionId: sectionFilter,
        isActive: true,
        deletedAt: null,
        student: { status: "ACTIVE", deletedAt: null },
      },
      include: {
        student: { include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } } },
      },
      orderBy: { student: { user: { lastName: "asc" } } },
    }),
    prisma.grade.findMany({
      where: {
        schoolId: access.session.schoolId,
        subjectId,
        termId,
        deletedAt: null,
      },
    }),
  ])
  const byStudent = new Map(grades.map((g) => [g.studentId, g]))

  const rows = enrollments.map((e) => {
    const g = byStudent.get(e.student.id)
    const components =
      (g?.caComponents as Record<string, number> | null | undefined) ?? null
    return {
      studentId: e.student.id,
      admissionNumber: e.student.admissionNumber,
      firstName: e.student.user.firstName,
      lastName: e.student.user.lastName,
      avatarUrl: e.student.user.avatarUrl,
      caComponents: components,
      caScore: g ? g.caScore : 0,
      examScore: g ? g.examScore : 0,
      totalScore: g ? g.totalScore : 0,
      letterGrade: g?.letterGrade ?? null,
      position: g?.position ?? null,
      teacherRemark: g?.teacherRemark ?? null,
      gradeId: g?.id ?? null,
    }
  })

  return NextResponse.json({
    section: section
      ? { id: section.id, name: section.name, className: section.class.name, classId: section.classId }
      : null,
    subject: { id: subject.id, name: subject.name, code: subject.code, waecCode: subject.waecCode },
    term: { id: term.id, type: term.type, sessionName: term.academicYear.name },
    config: {
      components: config.caComponents,
      perComponentMax: config.perComponentMax,
      caMax: config.caMax,
      examMax: config.examMax,
      scale: config.scale,
    },
    rows,
  })
}

/**
 * Bulk upsert + recompute positions in a transaction. Authorisation: teacher
 * must own this (subject, section) pair or be privileged.
 */
export async function POST(req: Request) {
  const access = await resolveGradeAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = bulkGradesSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { classId, sectionId, termId, subjectId, entries } = parsed.data

  // Resolve a single section for the auth check. Prefer the explicit one,
  // otherwise validate against the class's first section.
  const resolvedSectionId = sectionId ?? (
    await prisma.section.findFirst({
      where: { schoolId: access.session.schoolId, classId, deletedAt: null },
      select: { id: true },
    })
  )?.id
  if (!resolvedSectionId) {
    return NextResponse.json({ error: "No section under this class" }, { status: 422 })
  }

  const allowed = await teacherCanGrade({
    schoolId: access.session.schoolId,
    staffId: access.teacherStaffId,
    subjectId,
    sectionId: resolvedSectionId,
    isPrivileged: access.isPrivileged,
  })
  if (!allowed) return NextResponse.json({ error: "Not assigned to this subject" }, { status: 403 })

  const config = await getGradingConfig(access.session.schoolId)

  // Validate every student is enrolled in the target section(s).
  const studentIds = entries.map((e) => e.studentId)
  const enrolled = await prisma.enrollment.findMany({
    where: {
      studentId: { in: studentIds },
      isActive: true,
      deletedAt: null,
      ...(sectionId ? { sectionId } : { section: { classId } }),
    },
    select: { studentId: true },
  })
  const enrolledSet = new Set(enrolled.map((e) => e.studentId))
  const invalid = studentIds.filter((id) => !enrolledSet.has(id))
  if (invalid.length > 0) {
    return NextResponse.json({ error: "Some students aren't enrolled", invalid }, { status: 422 })
  }

  const recorderStaff = access.teacherStaffId

  // Compute totals + letter grades client-side so all rows are consistent.
  const computed = entries.map((e) => {
    const total = totalCaFrom(e.caComponents ?? null, config.caComponents)
    const exam = typeof e.examScore === "number" ? e.examScore : 0
    const sum = Math.round((total + exam) * 10) / 10
    const lg = letterGradeFor(sum, config.scale)
    return {
      studentId: e.studentId,
      caComponents: e.caComponents ?? null,
      caScore: total,
      examScore: exam,
      totalScore: sum,
      letterGrade: lg?.grade ?? null,
      teacherRemark: e.teacherRemark || null,
    }
  })

  await prisma.$transaction([
    ...computed.map((c) =>
      prisma.grade.upsert({
        where: {
          studentId_subjectId_termId: {
            studentId: c.studentId,
            subjectId,
            termId,
          },
        },
        create: {
          schoolId: access.session.schoolId,
          studentId: c.studentId,
          subjectId,
          termId,
          caComponents: c.caComponents ?? Prisma.JsonNull,
          caScore: c.caScore,
          examScore: c.examScore,
          totalScore: c.totalScore,
          letterGrade: c.letterGrade,
          teacherRemark: c.teacherRemark,
          recordedById: recorderStaff,
        },
        update: {
          caComponents: c.caComponents ?? Prisma.JsonNull,
          caScore: c.caScore,
          examScore: c.examScore,
          totalScore: c.totalScore,
          letterGrade: c.letterGrade,
          teacherRemark: c.teacherRemark,
          recordedById: recorderStaff,
        },
      }),
    ),
  ])

  // Recompute positions across the full subject roster for the section/class.
  const allGrades = await prisma.grade.findMany({
    where: {
      schoolId: access.session.schoolId,
      subjectId,
      termId,
      deletedAt: null,
      student: {
        enrollments: {
          some: {
            isActive: true,
            deletedAt: null,
            ...(sectionId ? { sectionId } : { section: { classId } }),
          },
        },
      },
    },
    select: { id: true, studentId: true, totalScore: true },
  })
  const positions = computePositions(allGrades)

  await prisma.$transaction(
    allGrades
      .map((g) => {
        const pos = positions.get(g.studentId)
        return pos === undefined
          ? null
          : prisma.grade.update({ where: { id: g.id }, data: { position: pos } })
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  )

  return NextResponse.json({ ok: true, saved: computed.length })
}
