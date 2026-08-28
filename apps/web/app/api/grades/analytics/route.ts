import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveGradeAccess } from "@/lib/grade-access"
import { getGradingConfig, letterGradeFor } from "@/lib/grade-config"

export const runtime = "nodejs"

/**
 * Class performance analytics for a (class|section, term).
 *
 *   subjects: per-subject avg/min/max/pass-rate + grade-distribution histogram
 *   termOverTerm: per-subject avg across the last 3 terms (line chart data)
 *   ranking: per-student total/average/position (for prize-giving sheet)
 *
 * Pass rate uses 50% as the threshold (any letter grade where minScore >= 50).
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

  const config = await getGradingConfig({
    schoolId: access.session.schoolId,
    classId,
    sectionId,
  })

  const sectionFilter = sectionId
    ? sectionId
    : {
        in: await prisma.section
          .findMany({
            where: { schoolId: access.session.schoolId, classId: classId!, deletedAt: null },
            select: { id: true },
          })
          .then((rows) => rows.map((r) => r.id)),
      }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      schoolId: access.session.schoolId,
      sectionId: sectionFilter,
      isActive: true,
      deletedAt: null,
    },
    include: {
      student: { include: { user: { select: { firstName: true, lastName: true } } } },
      section: { select: { name: true, class: { select: { name: true } } } },
    },
  })
  const studentIds = enrollments.map((e) => e.student.id)

  if (studentIds.length === 0) {
    return NextResponse.json({
      subjects: [],
      termOverTerm: [],
      ranking: [],
      gradeBuckets: config.scale.map((s) => s.grade),
    })
  }

  // Pull current-term grades + the two prior terms for trend.
  const currentTerm = await prisma.term.findUnique({
    where: { id: termId },
    include: { academicYear: { select: { id: true, name: true } } },
  })
  if (!currentTerm) return NextResponse.json({ error: "Term not found" }, { status: 404 })

  const recentTerms = await prisma.term.findMany({
    where: {
      academicYear: { schoolId: access.session.schoolId },
      startDate: { lte: currentTerm.startDate },
    },
    orderBy: { startDate: "desc" },
    take: 3,
    include: { academicYear: { select: { name: true } } },
  })

  const grades = await prisma.grade.findMany({
    where: {
      schoolId: access.session.schoolId,
      studentId: { in: studentIds },
      termId: { in: recentTerms.map((t) => t.id) },
      deletedAt: null,
    },
    include: { subject: { select: { id: true, name: true, code: true } } },
  })

  // Per-subject (current term).
  type SubjectAgg = {
    id: string
    name: string
    code: string
    scores: number[]
    pass: number
    fail: number
    distribution: Record<string, number>
  }
  const subjMap = new Map<string, SubjectAgg>()
  for (const g of grades) {
    if (g.termId !== termId) continue
    let agg = subjMap.get(g.subjectId)
    if (!agg) {
      agg = {
        id: g.subjectId,
        name: g.subject.name,
        code: g.subject.code,
        scores: [],
        pass: 0,
        fail: 0,
        distribution: Object.fromEntries(config.scale.map((s) => [s.grade, 0])),
      }
      subjMap.set(g.subjectId, agg)
    }
    agg.scores.push(g.totalScore)
    const lg = g.letterGrade ?? letterGradeFor(g.totalScore, config.scale)?.grade ?? null
    if (lg) agg.distribution[lg] = (agg.distribution[lg] ?? 0) + 1
    if (g.totalScore >= 50) agg.pass += 1
    else agg.fail += 1
  }
  const subjects = Array.from(subjMap.values()).map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    count: s.scores.length,
    average: s.scores.length ? Math.round((s.scores.reduce((a, b) => a + b, 0) / s.scores.length) * 10) / 10 : null,
    highest: s.scores.length ? Math.max(...s.scores) : null,
    lowest: s.scores.length ? Math.min(...s.scores) : null,
    passRate: s.scores.length ? Math.round((s.pass / s.scores.length) * 100) : null,
    distribution: s.distribution,
  }))

  // Term-over-term per subject.
  type TotPerTermSubj = Map<string, { sum: number; count: number; subjectName: string }>
  const termSubj = new Map<string, TotPerTermSubj>()
  for (const g of grades) {
    if (!termSubj.has(g.termId)) termSubj.set(g.termId, new Map())
    const inner = termSubj.get(g.termId)!
    const cur = inner.get(g.subjectId) ?? { sum: 0, count: 0, subjectName: g.subject.name }
    cur.sum += g.totalScore
    cur.count += 1
    inner.set(g.subjectId, cur)
  }
  const termOverTerm = recentTerms
    .slice()
    .reverse()
    .map((t) => {
      const inner = termSubj.get(t.id)
      const points: Record<string, number | null> = {}
      if (inner) {
        inner.forEach((v) => {
          points[v.subjectName] = Math.round((v.sum / v.count) * 10) / 10
        })
      }
      return {
        termId: t.id,
        label: `${t.academicYear.name} ${t.type[0]}`,
        scores: points,
      }
    })

  // Student ranking (current term).
  type RankAgg = {
    studentId: string
    name: string
    admissionNumber: string
    className: string | null
    sectionName: string | null
    total: number
    count: number
  }
  const rankMap = new Map<string, RankAgg>()
  for (const e of enrollments) {
    rankMap.set(e.student.id, {
      studentId: e.student.id,
      name: `${e.student.user.firstName} ${e.student.user.lastName}`,
      admissionNumber: e.student.admissionNumber,
      className: e.section.class.name,
      sectionName: e.section.name,
      total: 0,
      count: 0,
    })
  }
  for (const g of grades) {
    if (g.termId !== termId) continue
    const r = rankMap.get(g.studentId)
    if (!r) continue
    r.total += g.totalScore
    r.count += 1
  }
  const ranking = Array.from(rankMap.values())
    .map((r) => ({
      ...r,
      average: r.count ? Math.round((r.total / r.count) * 10) / 10 : null,
    }))
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1))
    .map((r, idx) => ({ ...r, position: r.average === null ? null : idx + 1 }))

  return NextResponse.json({
    subjects,
    termOverTerm,
    ranking,
    gradeBuckets: config.scale.map((s) => s.grade),
  })
}
