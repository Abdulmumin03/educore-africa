import type { RiskLevel } from "@prisma/client"
import { prisma } from "@/lib/db"
import { aiConfigured, generateJson, FAST_MODEL } from "@/lib/ai"

/**
 * Per-student factor scores feeding the at-risk model. Each is 0–100 where
 * higher = better (so the AI sees consistent direction).
 */
export type FactorScores = {
  attendanceScore: number
  gradeScore: number
  behaviorScore: number
  engagementScore: number
  trendScore: number
}

export type StudentRiskInput = {
  studentId: string
  name: string
  className: string | null
  factors: FactorScores
  termAttendance: { schoolDays: number; present: number; late: number }
  termGrades: { count: number; average: number | null }
  incidents: { last30: number; last90: number }
}

export type StudentRiskOutput = {
  studentId: string
  score: number // 0-100, higher = worse risk
  level: RiskLevel
  recommendation: string
}

const SYSTEM_PROMPT = `You are an academic risk assessment AI for a Nigerian K-12 school.

Given per-student metrics (each 0-100, HIGHER is BETTER), produce an overall risk score (0-100, HIGHER is WORSE), a risk level, and a one-sentence recommendation that names a concrete action.

Risk level thresholds:
  0-29   = LOW
  30-54  = MEDIUM
  55-79  = HIGH
  80-100 = CRITICAL

Be calibrated: a student with 90+ across all factors is NOT at risk. A student with attendance below 60 AND grades below 50 IS critical. Trend matters — a declining trajectory adds risk even if current numbers look OK.

Return STRICT JSON, no markdown:
{"items":[{"studentId":"...","score":<int>,"level":"LOW|MEDIUM|HIGH|CRITICAL","recommendation":"..."}]}

Use studentId values exactly as provided. Don't invent students.`

const LATE_HALF_WEIGHT = 0.5
const TERM_INCIDENT_PENALTY = 10

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * Pull every active student in the school + compute the 5 factor scores. Pure
 * data work, no AI yet.
 */
export async function buildRiskInputs(schoolId: string): Promise<StudentRiskInput[]> {
  const term = await prisma.term.findFirst({
    where: { isCurrent: true, academicYear: { schoolId } },
    select: { id: true, startDate: true, endDate: true, academicYearId: true },
  })
  if (!term) return []

  const students = await prisma.student.findMany({
    where: { schoolId, status: "ACTIVE", deletedAt: null },
    include: {
      user: { select: { firstName: true, lastName: true } },
      enrollments: {
        where: { isActive: true, deletedAt: null },
        take: 1,
        include: { class: { select: { name: true } } },
      },
    },
  })
  if (students.length === 0) return []

  const studentIds = students.map((s) => s.id)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [attendanceCounts, currentGrades, priorGrades, incidentsTerm, incidents30, submissions, assignments] =
    await Promise.all([
      prisma.attendance.groupBy({
        by: ["studentId", "status"],
        where: { studentId: { in: studentIds }, termId: term.id, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.grade.findMany({
        where: { studentId: { in: studentIds }, termId: term.id, deletedAt: null },
        select: { studentId: true, totalScore: true },
      }),
      // Previous term's average per student (for trend).
      prisma.term.findFirst({
        where: { academicYearId: term.academicYearId, startDate: { lt: term.startDate } },
        orderBy: { startDate: "desc" },
        select: { id: true },
      }).then((prior) =>
        prior
          ? prisma.grade.groupBy({
              by: ["studentId"],
              where: { studentId: { in: studentIds }, termId: prior.id, deletedAt: null },
              _avg: { totalScore: true },
            })
          : ([] as Array<{ studentId: string; _avg: { totalScore: number | null } }>),
      ),
      prisma.behaviorLog.groupBy({
        by: ["studentId"],
        where: { studentId: { in: studentIds }, date: { gte: term.startDate }, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.behaviorLog.groupBy({
        by: ["studentId"],
        where: { studentId: { in: studentIds }, date: { gte: thirtyDaysAgo }, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.assignmentSubmission.groupBy({
        by: ["studentId"],
        where: { studentId: { in: studentIds }, submittedAt: { gte: ninetyDaysAgo } },
        _count: { _all: true },
      }),
      prisma.assignment.count({
        where: { schoolId, termId: term.id, deletedAt: null },
      }),
    ])

  // Reshape attendance per student.
  type AttAgg = { present: number; late: number; absent: number; excused: number }
  const attBy = new Map<string, AttAgg>()
  for (const r of attendanceCounts) {
    const cur = attBy.get(r.studentId) ?? { present: 0, late: 0, absent: 0, excused: 0 }
    if (r.status === "PRESENT") cur.present += r._count._all
    if (r.status === "LATE") cur.late += r._count._all
    if (r.status === "ABSENT") cur.absent += r._count._all
    if (r.status === "EXCUSED") cur.excused += r._count._all
    attBy.set(r.studentId, cur)
  }

  // Current-term grades per student.
  const gradeBy = new Map<string, { sum: number; count: number }>()
  for (const g of currentGrades) {
    const cur = gradeBy.get(g.studentId) ?? { sum: 0, count: 0 }
    cur.sum += Number(g.totalScore)
    cur.count += 1
    gradeBy.set(g.studentId, cur)
  }
  const priorAvgBy = new Map<string, number>()
  for (const g of priorGrades) {
    if (g._avg.totalScore != null) priorAvgBy.set(g.studentId, Number(g._avg.totalScore))
  }
  const incidentsTermBy = new Map<string, number>(
    incidentsTerm.map((i) => [i.studentId, i._count._all]),
  )
  const incidents30By = new Map<string, number>(
    incidents30.map((i) => [i.studentId, i._count._all]),
  )
  const submissionsBy = new Map<string, number>(
    submissions.map((s) => [s.studentId, s._count._all]),
  )

  return students.map((s): StudentRiskInput => {
    const att = attBy.get(s.id) ?? { present: 0, late: 0, absent: 0, excused: 0 }
    const totalDays = att.present + att.late + att.absent + att.excused
    const attendanceScore =
      totalDays === 0
        ? 100
        : clamp(((att.present + att.late * LATE_HALF_WEIGHT) / totalDays) * 100)

    const grade = gradeBy.get(s.id) ?? { sum: 0, count: 0 }
    const gradeAvg = grade.count === 0 ? null : grade.sum / grade.count
    const gradeScore = gradeAvg === null ? 75 : clamp(gradeAvg)

    const termIncidents = incidentsTermBy.get(s.id) ?? 0
    const behaviorScore = clamp(100 - termIncidents * TERM_INCIDENT_PENALTY)

    const submitted = submissionsBy.get(s.id) ?? 0
    // Per-student we don't have assigned counts; use school-wide as proxy denom.
    const engagementScore =
      assignments === 0 ? 100 : clamp(Math.round((submitted / assignments) * 100))

    const prior = priorAvgBy.get(s.id)
    const trendScore =
      gradeAvg === null || prior === undefined
        ? 75 // neutral baseline when we lack signal
        : clamp(50 + (gradeAvg - prior) * 5) // ±10 grade points → ±50 score

    return {
      studentId: s.id,
      name: `${s.user.firstName} ${s.user.lastName}`,
      className: s.enrollments[0]?.class.name ?? null,
      factors: {
        attendanceScore: Math.round(attendanceScore),
        gradeScore: Math.round(gradeScore),
        behaviorScore: Math.round(behaviorScore),
        engagementScore: Math.round(engagementScore),
        trendScore: Math.round(trendScore),
      },
      termAttendance: { schoolDays: totalDays, present: att.present, late: att.late },
      termGrades: { count: grade.count, average: gradeAvg },
      incidents: { last30: incidents30By.get(s.id) ?? 0, last90: termIncidents },
    }
  })
}

/**
 * Heuristic fallback (used when ANTHROPIC_API_KEY isn't set). Mirrors the
 * thresholds Claude is told to use.
 */
function heuristicScore(input: StudentRiskInput): StudentRiskOutput {
  const f = input.factors
  // Inverse-weight the factors (low factor = high risk).
  const weights = {
    attendance: 0.30,
    grade: 0.30,
    behavior: 0.15,
    engagement: 0.15,
    trend: 0.10,
  }
  const inverted =
    (100 - f.attendanceScore) * weights.attendance +
    (100 - f.gradeScore) * weights.grade +
    (100 - f.behaviorScore) * weights.behavior +
    (100 - f.engagementScore) * weights.engagement +
    (100 - f.trendScore) * weights.trend
  const score = Math.round(clamp(inverted))
  let level: RiskLevel = "LOW"
  if (score >= 80) level = "CRITICAL"
  else if (score >= 55) level = "HIGH"
  else if (score >= 30) level = "MEDIUM"

  // Recommendation by weakest factor.
  const weakest = Object.entries(f).sort((a, b) => a[1] - b[1])[0]
  const tipBy: Record<string, string> = {
    attendanceScore: "Investigate attendance pattern with the parent this week.",
    gradeScore: "Pair with a peer tutor and review fundamentals in weakest subjects.",
    behaviorScore: "Schedule a counselor session and document expectations clearly.",
    engagementScore: "Follow up on missing assignments and offer a recovery window.",
    trendScore: "Acknowledge the decline directly and set a measurable goal for next term.",
  }
  return {
    studentId: input.studentId,
    score,
    level,
    recommendation: tipBy[weakest[0]] ?? "Schedule a guardian meeting to align on next steps.",
  }
}

/**
 * Run the AI model over the prepared inputs (batched in chunks of 25 to keep
 * the prompt + response manageable). Falls back to the heuristic when Claude
 * isn't available.
 */
export async function scoreStudents(
  inputs: StudentRiskInput[],
): Promise<{ items: StudentRiskOutput[]; model: string }> {
  if (inputs.length === 0) return { items: [], model: "noop" }
  if (!aiConfigured()) {
    return { items: inputs.map(heuristicScore), model: "heuristic-fallback" }
  }

  const BATCH = 25
  const results: StudentRiskOutput[] = []
  for (let i = 0; i < inputs.length; i += BATCH) {
    const chunk = inputs.slice(i, i + BATCH)
    const payload = chunk.map((s) => ({
      studentId: s.studentId,
      name: s.name,
      className: s.className,
      ...s.factors,
      gradesRecorded: s.termGrades.count,
      schoolDaysTracked: s.termAttendance.schoolDays,
      incidentsLast30Days: s.incidents.last30,
    }))
    const res = await generateJson<{ items: StudentRiskOutput[] }>({
      system: SYSTEM_PROMPT,
      user: JSON.stringify(payload),
      maxTokens: 1500,
      model: FAST_MODEL,
    })
    if (!res.ok) {
      // On any AI failure, score this chunk heuristically rather than erroring the whole run.
      chunk.forEach((s) => results.push(heuristicScore(s)))
      continue
    }
    const byId = new Map(chunk.map((s) => [s.studentId, s]))
    for (const item of res.data.items ?? []) {
      if (!byId.has(item.studentId)) continue
      results.push({
        studentId: item.studentId,
        score: Math.round(clamp(item.score)),
        level: (["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).includes(item.level as RiskLevel)
          ? (item.level as RiskLevel)
          : "MEDIUM",
        recommendation: item.recommendation ?? "Schedule a guardian meeting.",
      })
    }
    // Any students Claude dropped on the floor, score heuristically.
    for (const s of chunk) {
      if (!results.find((r) => r.studentId === s.studentId)) {
        results.push(heuristicScore(s))
      }
    }
  }
  return { items: results, model: FAST_MODEL }
}

/**
 * Persist a batch of computed scores. Soft-deletes nothing — keeps a history
 * so we can chart risk over time.
 */
export async function persistRiskScores(
  schoolId: string,
  inputs: StudentRiskInput[],
  outputs: StudentRiskOutput[],
  model: string,
): Promise<number> {
  const inputById = new Map(inputs.map((i) => [i.studentId, i]))
  const rows = outputs.map((o) => {
    const input = inputById.get(o.studentId)
    return {
      schoolId,
      studentId: o.studentId,
      level: o.level,
      score: o.score / 100, // AIRiskScore.score is Float (0..1) by historical use
      factors: input ? input.factors : {},
      rationale: o.recommendation,
      model,
    }
  })
  if (rows.length === 0) return 0
  await prisma.aIRiskScore.createMany({ data: rows })
  return rows.length
}
