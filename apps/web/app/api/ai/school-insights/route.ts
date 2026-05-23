import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { generateJson, FAST_MODEL, aiConfigured } from "@/lib/ai"
import { redis } from "@/lib/redis"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CACHE_TTL_SECONDS = 60 * 60 * 6 // 6h — recomputes when admin presses Refresh
const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

type Recommendation = {
  title: string
  description: string
  priority: "LOW" | "MEDIUM" | "HIGH"
  area: string
}

const SYSTEM_PROMPT = `You are an educational analytics AI for a Nigerian K-12 school principal.

Given current-term metrics, write exactly 3 specific, actionable recommendations the principal could implement THIS week. Each must name a concrete next step (not "do better"). Pick ones that address the metric that's furthest from a healthy target:
  • Attendance < 85% → urgent
  • Average grade < 60 → urgent
  • Fee collection < 70% → urgent
  • Behavioral incidents > 5/week → urgent
  • At-risk students > 10% of total → urgent

Areas: "ATTENDANCE", "ACADEMICS", "FINANCE", "BEHAVIOR", "WELLBEING", "OPERATIONS".

Return STRICT JSON, no markdown:
{"items":[{"title","description","priority":"LOW|MEDIUM|HIGH","area":"..."}]}`

async function buildAggregates(schoolId: string) {
  const term = await prisma.term.findFirst({
    where: { isCurrent: true, academicYear: { schoolId } },
    include: { academicYear: { select: { name: true } } },
  })
  if (!term) return null

  const [
    attendanceTotals,
    grades,
    invoiceTotals,
    incidents,
    activeStudents,
    riskScores,
  ] = await Promise.all([
    prisma.attendance.groupBy({
      by: ["status"],
      where: { schoolId, termId: term.id, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.grade.aggregate({
      where: { schoolId, termId: term.id, deletedAt: null },
      _avg: { totalScore: true },
      _count: { _all: true },
    }),
    prisma.feeInvoice.aggregate({
      where: { schoolId, termId: term.id, deletedAt: null },
      _sum: { amountDue: true, amountPaid: true },
      _count: { _all: true },
    }),
    prisma.behaviorLog.count({
      where: { schoolId, date: { gte: term.startDate }, deletedAt: null },
    }),
    prisma.student.count({
      where: { schoolId, status: "ACTIVE", deletedAt: null },
    }),
    prisma.aIRiskScore.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: [{ studentId: "asc" }, { computedAt: "desc" }],
      select: { studentId: true, level: true, score: true, computedAt: true },
    }),
  ])

  const att = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
  for (const r of attendanceTotals) att[r.status] = r._count._all
  const attTotal = att.PRESENT + att.ABSENT + att.LATE + att.EXCUSED
  const attendancePct = attTotal === 0 ? null : Math.round(((att.PRESENT + att.LATE * 0.5) / attTotal) * 100)

  const invoiced = Number(invoiceTotals._sum.amountDue ?? 0)
  const collected = Number(invoiceTotals._sum.amountPaid ?? 0)
  const collectionPct = invoiced === 0 ? null : Math.round((collected / invoiced) * 100)

  // Dedupe risk scores to most-recent per student.
  const seenStudent = new Set<string>()
  const latestRisk = []
  for (const r of riskScores) {
    if (seenStudent.has(r.studentId)) continue
    seenStudent.add(r.studentId)
    latestRisk.push(r)
  }
  const atRisk = latestRisk.filter((r) => r.level === "HIGH" || r.level === "CRITICAL").length

  return {
    term: { id: term.id, label: `${term.academicYear.name} ${term.type}` },
    attendance: {
      pct: attendancePct,
      present: att.PRESENT,
      absent: att.ABSENT,
      late: att.LATE,
      excused: att.EXCUSED,
    },
    grades: {
      average:
        grades._avg.totalScore !== null ? Math.round(Number(grades._avg.totalScore) * 10) / 10 : null,
      count: grades._count._all,
    },
    fees: { invoiced, collected, outstanding: Math.max(0, invoiced - collected), collectionPct },
    incidents,
    activeStudents,
    atRiskStudents: atRisk,
    riskCovered: latestRisk.length,
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!VIEW_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const noCache = url.searchParams.get("refresh") === "1"
  const cacheKey = `ai:school-insights:${session.user.schoolId}`

  if (!noCache) {
    try {
      const cached = await redis.get(cacheKey)
      if (cached) return NextResponse.json(JSON.parse(cached))
    } catch {
      // Redis unavailable — fall through to compute.
    }
  }

  const aggregates = await buildAggregates(session.user.schoolId)
  if (!aggregates) {
    return NextResponse.json({ error: "No active term" }, { status: 404 })
  }

  let recommendations: Recommendation[] = []
  let model = "skipped"

  if (aiConfigured()) {
    const res = await generateJson<{ items: Recommendation[] }>({
      system: SYSTEM_PROMPT,
      user: JSON.stringify(aggregates),
      model: FAST_MODEL,
      maxTokens: 800,
    })
    if (res.ok) {
      recommendations = res.data.items.slice(0, 3).map((r) => ({
        title: r.title,
        description: r.description,
        priority: ["LOW", "MEDIUM", "HIGH"].includes(r.priority) ? r.priority : "MEDIUM",
        area: r.area || "OPERATIONS",
      }))
      model = res.model
    }
  }
  if (recommendations.length === 0) {
    // Heuristic fallback.
    recommendations = []
    if (aggregates.attendance.pct !== null && aggregates.attendance.pct < 85) {
      recommendations.push({
        title: "Lift attendance back above 85%",
        description: `Term attendance is ${aggregates.attendance.pct}%. Push class-teacher daily calls home for any student missing 2+ days.`,
        priority: "HIGH",
        area: "ATTENDANCE",
      })
    }
    if (aggregates.grades.average !== null && aggregates.grades.average < 60) {
      recommendations.push({
        title: "Run remedial in weakest subjects",
        description: `Class average is ${aggregates.grades.average}%. Identify the 2 subjects pulling it down and run a Saturday remedial.`,
        priority: "HIGH",
        area: "ACADEMICS",
      })
    }
    if (aggregates.fees.collectionPct !== null && aggregates.fees.collectionPct < 70) {
      recommendations.push({
        title: "Push fee collection this week",
        description: `Only ${aggregates.fees.collectionPct}% collected. Trigger the debtor SMS reminder cron and call the top-10 outstanding accounts.`,
        priority: "HIGH",
        area: "FINANCE",
      })
    }
    while (recommendations.length < 3) {
      recommendations.push({
        title: "Keep current cadence",
        description: "No urgent issues detected — maintain existing routines and review next week.",
        priority: "LOW",
        area: "OPERATIONS",
      })
    }
    model = "heuristic-fallback"
  }

  const payload = {
    aggregates,
    recommendations,
    model,
    generatedAt: new Date().toISOString(),
  }
  try {
    await redis.set(cacheKey, JSON.stringify(payload), "EX", CACHE_TTL_SECONDS)
  } catch {
    // Cache failures are non-fatal.
  }

  return NextResponse.json(payload)
}
