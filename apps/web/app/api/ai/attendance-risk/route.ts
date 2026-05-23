import { NextResponse } from "next/server"
import { anthropic } from "@/lib/ai"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const RISK_MODEL = "claude-sonnet-4-6"
const MIN_DAYS_TO_PREDICT = 5

const SYSTEM_PROMPT = `You analyse Nigerian K-12 school attendance data and predict which students are at risk of falling below 75% attendance by end of term. Look at trend (improving / declining / stable), current %, and how much of the term remains.

Return STRICT JSON only — no markdown, no commentary. Shape:
{"items":[{"studentId":"...","predictedPct":<0-100>,"riskLevel":"LOW|MEDIUM|HIGH|CRITICAL","recommendation":"one short sentence"}]}

Rules:
- Only include students whose predicted end-of-term % is below 80 (i.e. plausibly at risk).
- CRITICAL: already below 65% OR predicted to drop below 60%.
- HIGH: 65-74% currently OR predicted below 70%.
- MEDIUM: 75-79% currently with a declining trend.
- LOW: skip entirely (don't include in items).
- recommendation: concrete next step (e.g. "Schedule parent meeting", "Verify home situation", "Check for medical issue"). Avoid generic advice.
- Don't invent students. Don't guess studentIds — use them verbatim.`

type StudentForRisk = {
  studentId: string
  name: string
  className: string | null
  totalDays: number
  present: number
  absent: number
  late: number
  excused: number
  currentPct: number
  recentTrend: number[]
}

function pct(present: number, late: number, total: number) {
  if (total === 0) return 100
  return Math.round(((present + late * 0.5) / total) * 100)
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "COUNSELOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const term = await prisma.term.findFirst({
    where: { isCurrent: true, academicYear: { schoolId: session.user.schoolId } },
    select: { id: true, startDate: true, endDate: true },
  })
  if (!term) return NextResponse.json({ items: [], term: null, note: "No active term" })

  const now = new Date()
  const termTotalDays = Math.max(
    1,
    Math.round((term.endDate.getTime() - term.startDate.getTime()) / (1000 * 60 * 60 * 24)),
  )
  const elapsedDays = Math.max(
    1,
    Math.round((Math.min(now.getTime(), term.endDate.getTime()) - term.startDate.getTime()) / (1000 * 60 * 60 * 24)),
  )

  // Pull attendance per student grouped by status.
  const rows = await prisma.attendance.groupBy({
    by: ["studentId", "status"],
    where: { schoolId: session.user.schoolId, termId: term.id, deletedAt: null },
    _count: { _all: true },
  })

  // Aggregate per student.
  type Agg = { present: number; absent: number; late: number; excused: number }
  const aggByStudent = new Map<string, Agg>()
  for (const r of rows) {
    const agg = aggByStudent.get(r.studentId) ?? { present: 0, absent: 0, late: 0, excused: 0 }
    if (r.status === "PRESENT") agg.present += r._count._all
    else if (r.status === "ABSENT") agg.absent += r._count._all
    else if (r.status === "LATE") agg.late += r._count._all
    else if (r.status === "EXCUSED") agg.excused += r._count._all
    aggByStudent.set(r.studentId, agg)
  }

  // Only consider students with enough signal AND a currentPct < 90.
  const candidateIds: string[] = []
  aggByStudent.forEach((a, id) => {
    const total = a.present + a.absent + a.late + a.excused
    if (total < MIN_DAYS_TO_PREDICT) return
    if (pct(a.present, a.late, total) >= 90) return
    candidateIds.push(id)
  })

  if (candidateIds.length === 0) {
    return NextResponse.json({
      items: [],
      term: { id: term.id, elapsedDays, totalDays: termTotalDays },
      note: "No candidates",
    })
  }

  // Fetch names + last 10 attendance rows per candidate for trend data.
  const [students, recentRows] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: candidateIds } },
      include: {
        user: { select: { firstName: true, lastName: true } },
        enrollments: {
          where: { isActive: true, deletedAt: null },
          take: 1,
          include: { class: { select: { name: true } } },
        },
      },
    }),
    prisma.attendance.findMany({
      where: {
        studentId: { in: candidateIds },
        termId: term.id,
        deletedAt: null,
      },
      orderBy: { date: "desc" },
      select: { studentId: true, status: true, date: true },
    }),
  ])

  // Build last-10 day trend (1=present, 0.5=late, 0=absent/excused) per student.
  const trendByStudent = new Map<string, number[]>()
  for (const r of recentRows) {
    const arr = trendByStudent.get(r.studentId) ?? []
    if (arr.length < 10) {
      const v = r.status === "PRESENT" ? 1 : r.status === "LATE" ? 0.5 : 0
      arr.push(v)
    }
    trendByStudent.set(r.studentId, arr)
  }

  const dataset: StudentForRisk[] = students.map((s) => {
    const a = aggByStudent.get(s.id)!
    const total = a.present + a.absent + a.late + a.excused
    return {
      studentId: s.id,
      name: `${s.user.firstName} ${s.user.lastName}`,
      className: s.enrollments[0]?.class.name ?? null,
      totalDays: total,
      present: a.present,
      absent: a.absent,
      late: a.late,
      excused: a.excused,
      currentPct: pct(a.present, a.late, total),
      recentTrend: trendByStudent.get(s.id) ?? [],
    }
  })

  if (!process.env.ANTHROPIC_API_KEY) {
    // Heuristic fallback so the page still works without Claude.
    const items = dataset
      .map((d) => {
        const recent10 = d.recentTrend.slice(0, 10)
        const recentAvg =
          recent10.length === 0
            ? d.currentPct / 100
            : recent10.reduce((a, b) => a + b, 0) / recent10.length
        const predictedPct = Math.round(((recentAvg * 100) + d.currentPct) / 2)
        const riskLevel =
          predictedPct < 60
            ? "CRITICAL"
            : predictedPct < 70
              ? "HIGH"
              : predictedPct < 80
                ? "MEDIUM"
                : null
        return riskLevel
          ? {
              studentId: d.studentId,
              name: d.name,
              className: d.className,
              currentPct: d.currentPct,
              predictedPct,
              riskLevel,
              recommendation:
                "Schedule a parent meeting and verify there are no medical or transport barriers.",
            }
          : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    return NextResponse.json({
      items,
      model: "heuristic-fallback",
      term: { id: term.id, elapsedDays, totalDays: termTotalDays },
      note: "ANTHROPIC_API_KEY not set — using heuristic predictions",
    })
  }

  // Cap payload size — pick the top 50 worst-current first.
  const trimmed = [...dataset]
    .sort((a, b) => a.currentPct - b.currentPct)
    .slice(0, 50)

  const userPrompt = [
    `Term progress: ${elapsedDays}/${termTotalDays} days elapsed.`,
    `Students (${trimmed.length}):`,
    JSON.stringify(trimmed),
  ].join("\n")

  try {
    const response = await anthropic.messages.create({
      model: RISK_MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    })
    const text = response.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim()

    let parsed: { items: Array<{ studentId: string; predictedPct: number; riskLevel: string; recommendation: string }> } = {
      items: [],
    }
    try {
      const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
      parsed = JSON.parse(cleaned)
    } catch {
      console.error("[ai/attendance-risk] failed to parse model output:", text)
      return NextResponse.json({ error: "AI returned unparseable response" }, { status: 502 })
    }

    // Re-attach names + className from our trusted data.
    const byId = new Map(dataset.map((d) => [d.studentId, d]))
    const items = (parsed.items ?? [])
      .map((item) => {
        const d = byId.get(item.studentId)
        if (!d) return null
        return {
          studentId: d.studentId,
          name: d.name,
          className: d.className,
          currentPct: d.currentPct,
          predictedPct: Math.max(0, Math.min(100, Math.round(item.predictedPct))),
          riskLevel: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(item.riskLevel)
            ? item.riskLevel
            : "MEDIUM",
          recommendation: item.recommendation,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    return NextResponse.json({
      items,
      model: RISK_MODEL,
      term: { id: term.id, elapsedDays, totalDays: termTotalDays },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI failure"
    console.error("[ai/attendance-risk]", err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
