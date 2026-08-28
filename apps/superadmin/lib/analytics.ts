import { Prisma } from "@prisma/client"
import type { NpsRole, SchoolPlan } from "@prisma/client"

import { prisma } from "@/lib/db"
import { monthlyAmount, REVENUE_STATUSES } from "@/lib/metrics"
import { PLAN_ORDER } from "@/lib/plans"

// Platform analytics. Every number is counted from rows that already exist —
// where a module has no table yet, it is reported as unbuilt rather than 0%,
// because those mean very different things to whoever reads this screen.

export type ModuleKey =
  | "attendance"
  | "grades"
  | "finance"
  | "ai_suite"
  | "elearning"
  | "library"
  | "hostel"
  | "transport"
  | "communication"
  | "alumni"

type ModuleDef = {
  key: ModuleKey
  label: string
  /** Any row in ANY of these tables counts the module as in use. */
  tables: string[]
}

export const MODULES: ModuleDef[] = [
  { key: "attendance", label: "Attendance", tables: ["attendance"] },
  { key: "grades", label: "Grades", tables: ["grades"] },
  { key: "finance", label: "Finance", tables: ["fee_invoices"] },
  { key: "ai_suite", label: "AI Suite", tables: ["ask_conversations", "ai_risk_scores", "question_bank"] },
  { key: "elearning", label: "E-Learning", tables: ["resources", "assignments"] },
  { key: "library", label: "Library", tables: ["libraries"] },
  { key: "hostel", label: "Hostel", tables: ["hostels"] },
  { key: "transport", label: "Transport", tables: ["bus_routes"] },
  { key: "communication", label: "Communication", tables: ["announcements", "sms_logs"] },
  // No alumni model exists in the platform. Reporting 0% would read as
  // "nobody uses it" rather than "it does not exist yet".
  { key: "alumni", label: "Alumni", tables: [] },
]

export type AdoptionCell = {
  plan: SchoolPlan
  schools: number
  using: number
  percent: number
}

export type AdoptionRow = {
  module: ModuleKey
  label: string
  built: boolean
  cells: AdoptionCell[]
  overall: { schools: number; using: number; percent: number }
}

/**
 * Module adoption by plan tier.
 *
 * One SQL statement: for each school, a boolean per module from correlated
 * EXISTS subqueries. Ten modules × five plans as separate queries would be
 * fifty round trips.
 */
export async function featureAdoptionMatrix(): Promise<{
  rows: AdoptionRow[]
  planTotals: Record<string, number>
  /** Schools counted in the grid: those that have a plan. */
  totalSchools: number
  /** Every non-deleted school on the platform. */
  platformSchools: number
  /** platformSchools − totalSchools. Surfaced so the gap is never silent. */
  unplanned: number
}> {
  const built = MODULES.filter((mod) => mod.tables.length > 0)

  const columns = Prisma.join(
    built.map(
      (mod) =>
        Prisma.sql`(CASE WHEN ${Prisma.join(
          mod.tables.map(
            (table) =>
              Prisma.sql`EXISTS (SELECT 1 FROM ${Prisma.raw(`"${table}"`)} t WHERE t."school_id" = s."id")`,
          ),
          " OR ",
        )} THEN 1 ELSE 0 END) AS ${Prisma.raw(`"${mod.key}"`)}`,
    ),
    ", ",
  )

  const rows = await prisma.$queryRaw<
    Array<{ plan: SchoolPlan | null } & Record<ModuleKey, number>>
  >`
    SELECT sub."plan" AS plan, ${columns}
    FROM "schools" s
    LEFT JOIN "school_subscriptions" sub ON sub."school_id" = s."id"
    WHERE s."deleted_at" IS NULL
  `

  const planTotals: Record<string, number> = {}
  for (const plan of PLAN_ORDER) planTotals[plan] = 0
  const usage = new Map<ModuleKey, Map<string, number>>()
  for (const mod of built) usage.set(mod.key, new Map())

  let totalSchools = 0
  let unplanned = 0
  for (const row of rows) {
    // A school with no subscription row has no column to sit in. It is
    // excluded from the grid and counted separately rather than folded into
    // a tier it was never on.
    if (!row.plan) {
      unplanned += 1
      continue
    }
    totalSchools += 1
    planTotals[row.plan] = (planTotals[row.plan] ?? 0) + 1
    for (const mod of built) {
      if (Number(row[mod.key]) === 1) {
        const bucket = usage.get(mod.key)!
        bucket.set(row.plan, (bucket.get(row.plan) ?? 0) + 1)
      }
    }
  }

  const result: AdoptionRow[] = MODULES.map((mod) => {
    if (mod.tables.length === 0) {
      return {
        module: mod.key,
        label: mod.label,
        built: false,
        cells: PLAN_ORDER.map((plan) => ({
          plan,
          schools: planTotals[plan] ?? 0,
          using: 0,
          percent: 0,
        })),
        overall: { schools: totalSchools, using: 0, percent: 0 },
      }
    }

    const bucket = usage.get(mod.key)!
    const cells = PLAN_ORDER.map((plan) => {
      const schools = planTotals[plan] ?? 0
      const using = bucket.get(plan) ?? 0
      return { plan, schools, using, percent: schools > 0 ? (using / schools) * 100 : 0 }
    })
    const usingTotal = cells.reduce((sum, cell) => sum + cell.using, 0)

    return {
      module: mod.key,
      label: mod.label,
      built: true,
      cells,
      overall: {
        schools: totalSchools,
        using: usingTotal,
        percent: totalSchools > 0 ? (usingTotal / totalSchools) * 100 : 0,
      },
    }
  })

  return {
    rows: result,
    planTotals,
    totalSchools,
    platformSchools: totalSchools + unplanned,
    unplanned,
  }
}

export type FunnelStage = {
  key: string
  label: string
  description: string
  count: number
  /** Share of the previous stage that reached this one. Null on the first. */
  ofPrevious: number | null
  ofTop: number
  /** Percentage of the previous stage lost here. */
  dropOff: number
  /** Absolute number of schools lost between the previous stage and this one. */
  lost: number
  /** False when the platform cannot observe this stage at all. */
  measurable: boolean
}

/**
 * Signup-to-renewal funnel.
 *
 * Each stage is a strict subset of the one above it: a school counts as
 * "converted to paid" only if it also cleared registration, onboarding and
 * first value. Counting the stages independently would let a later stage come
 * out larger than an earlier one, which is not a funnel — it is five unrelated
 * numbers stacked in a chart that implies progression.
 *
 * Stage 1 ("visited the signup page") is NOT measurable: there is no web
 * analytics table, and inferring visits from registrations would just restate
 * stage 2 with a made-up multiplier.
 */
export async function growthFunnel(): Promise<{ stages: FunnelStage[]; sinceDays: number | null }> {
  const [registeredIds, onboardedIds, firstValueIds, paidIds, renewedRows] = await Promise.all([
    prisma.school.findMany({ where: { deletedAt: null }, select: { id: true } }),
    // "Onboarding complete" = what the setup wizard produces: at least one
    // class, one staff member and one student.
    prisma.school.findMany({
      where: {
        deletedAt: null,
        classes: { some: { deletedAt: null } },
        staff: { some: { deletedAt: null } },
        students: { some: { deletedAt: null } },
      },
      select: { id: true },
    }),
    prisma.school.findMany({
      where: {
        deletedAt: null,
        OR: [{ attendance: { some: {} } }, { grades: { some: {} } }],
      },
      select: { id: true },
    }),
    // Left trial for a paid plan. CHURNED and SUSPENDED count: they were paid
    // once, and dropping them would make conversion look worse over time
    // purely because customers left.
    prisma.schoolSubscription.findMany({
      where: { status: { in: [...REVENUE_STATUSES, "CHURNED", "SUSPENDED"] } },
      select: { schoolId: true },
    }),
    // Renewed = more than one settled charge.
    prisma.subscriptionTransaction.groupBy({
      by: ["schoolId"],
      where: { status: { in: ["SUCCESSFUL", "PARTIALLY_REFUNDED", "REFUNDED"] } },
      _count: { _all: true },
    }),
  ])

  const sets = [
    new Set(registeredIds.map((row) => row.id)),
    new Set(onboardedIds.map((row) => row.id)),
    new Set(firstValueIds.map((row) => row.id)),
    new Set(paidIds.map((row) => row.schoolId)),
    new Set(renewedRows.filter((row) => row._count._all > 1).map((row) => row.schoolId)),
  ]

  // Nest them: each stage keeps only the schools that also cleared every
  // stage above it.
  const nested: Set<string>[] = []
  let carried: Set<string> | null = null
  for (const set of sets) {
    const above = carried
    const next: Set<string> =
      above === null ? new Set(set) : new Set([...set].filter((id) => above.has(id)))
    nested.push(next)
    carried = next
  }

  const meta = [
    {
      key: "registered",
      label: "Completed registration",
      description: "A school record exists",
    },
    {
      key: "onboarded",
      label: "Completed onboarding",
      description: "Has at least one class, one staff member and one student",
    },
    {
      key: "first_value",
      label: "First value event",
      description: "A register was taken or a grade was entered",
    },
    {
      key: "paid",
      label: "Converted to paid",
      description: "Left trial for a paid subscription",
    },
    {
      key: "renewed",
      label: "Renewed for a second term",
      description: "More than one settled charge",
    },
  ]

  const top = nested[0].size
  let previous: number | null = null

  const measured: FunnelStage[] = meta.map((stage, index) => {
    const count = nested[index].size
    const lost = previous === null ? 0 : previous - count
    const row: FunnelStage = {
      ...stage,
      count,
      ofPrevious: previous === null || previous === 0 ? null : (count / previous) * 100,
      ofTop: top > 0 ? (count / top) * 100 : 0,
      dropOff: previous === null || previous === 0 ? 0 : (lost / previous) * 100,
      lost,
      measurable: true,
    }
    previous = count
    return row
  })

  return {
    stages: [
      {
        key: "visited",
        label: "Visited signup page",
        description: "No web analytics table — this stage is not instrumented",
        count: 0,
        ofPrevious: null,
        ofTop: 0,
        dropOff: 0,
        lost: 0,
        measurable: false,
      },
      ...measured,
    ],
    // Every stage is measured over the platform's whole history, not a window.
    sinceDays: null,
  }
}

export type GeographicRow = {
  state: string
  schools: number
  students: number
  mrr: number
  topPlan: SchoolPlan | null
  growthPercent: number | null
}

export async function geographicBreakdown(): Promise<{
  rows: GeographicRow[]
  totals: { schools: number; students: number; mrr: number }
  opportunity: GeographicRow[]
}> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000)

  const [schools, priorCounts] = await Promise.all([
    prisma.school.findMany({
      where: { deletedAt: null },
      select: {
        state: true,
        subscription: { select: { plan: true, amount: true, cycle: true, status: true } },
        _count: { select: { students: { where: { deletedAt: null } } } },
      },
    }),
    prisma.school.groupBy({
      by: ["state"],
      where: { deletedAt: null, createdAt: { lt: ninetyDaysAgo } },
      _count: { _all: true },
    }),
  ])

  const priorByState = new Map(
    priorCounts.map((row) => [row.state?.trim() || "Unspecified", row._count._all]),
  )

  const agg = new Map<
    string,
    { schools: number; students: number; mrr: number; plans: Map<SchoolPlan, number> }
  >()

  for (const school of schools) {
    const state = school.state?.trim() || "Unspecified"
    const bucket = agg.get(state) ?? { schools: 0, students: 0, mrr: 0, plans: new Map() }
    bucket.schools += 1
    bucket.students += school._count.students
    if (school.subscription && REVENUE_STATUSES.includes(school.subscription.status)) {
      bucket.mrr += monthlyAmount(Number(school.subscription.amount), school.subscription.cycle)
    }
    if (school.subscription) {
      bucket.plans.set(school.subscription.plan, (bucket.plans.get(school.subscription.plan) ?? 0) + 1)
    }
    agg.set(state, bucket)
  }

  const rows: GeographicRow[] = [...agg.entries()]
    .map(([state, bucket]) => {
      const prior = priorByState.get(state) ?? 0
      return {
        state,
        schools: bucket.schools,
        students: bucket.students,
        mrr: bucket.mrr,
        topPlan: [...bucket.plans.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        growthPercent: prior > 0 ? ((bucket.schools - prior) / prior) * 100 : null,
      }
    })
    .sort((a, b) => b.schools - a.schools)

  return {
    rows,
    totals: {
      schools: rows.reduce((sum, row) => sum + row.schools, 0),
      students: rows.reduce((sum, row) => sum + row.students, 0),
      mrr: rows.reduce((sum, row) => sum + row.mrr, 0),
    },
    // Thin coverage, ranked by how little presence there is. Population
    // weighting would need census data the platform does not hold, so this is
    // presence-only and labelled as such.
    opportunity: rows.filter((row) => row.schools <= 2 && row.state !== "Unspecified").slice(0, 12),
  }
}

export type NpsSummary = {
  responses: number
  score: number | null
  promoters: number
  passives: number
  detractors: number
  byRole: Array<{ role: NpsRole; responses: number; score: number | null }>
  trend: Array<{ month: string; label: string; responses: number; score: number | null }>
  words: Array<{ word: string; count: number }>
  comments: Array<{ score: number; role: NpsRole; comment: string; school: string }>
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "have", "has", "not", "but", "you", "our", "are",
  "was", "were", "very", "just", "get", "got", "can", "would", "could", "there", "their", "them",
  "when", "what", "from", "they", "been", "more", "some", "than", "also", "who", "all", "its",
  "it's", "we", "is", "to", "of", "in", "on", "a", "i", "it", "at", "as", "be", "so", "my", "me",
])

function scoreOf(rows: Array<{ score: number }>): number | null {
  if (rows.length === 0) return null
  const promoters = rows.filter((row) => row.score >= 9).length
  const detractors = rows.filter((row) => row.score <= 6).length
  return ((promoters - detractors) / rows.length) * 100
}

export async function npsSummary(monthsBack = 12): Promise<NpsSummary> {
  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - (monthsBack - 1), 1))

  const responses = await prisma.npsResponse.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: {
      score: true,
      role: true,
      comment: true,
      createdAt: true,
      school: { select: { name: true } },
    },
  })

  const roles: NpsRole[] = ["SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT"]
  const byRole = roles.map((role) => {
    const subset = responses.filter((row) => row.role === role)
    return { role, responses: subset.length, score: scoreOf(subset) }
  })

  const trend: NpsSummary["trend"] = []
  for (let back = monthsBack - 1; back >= 0; back--) {
    const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - back, 1))
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
    const subset = responses.filter((row) => row.createdAt >= start && row.createdAt < end)
    trend.push({
      month: start.toISOString().slice(0, 7),
      label: start.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
      responses: subset.length,
      score: scoreOf(subset),
    })
  }

  const counts = new Map<string, number>()
  for (const row of responses) {
    if (!row.comment) continue
    for (const raw of row.comment.toLowerCase().split(/[^a-z']+/)) {
      const word = raw.trim()
      if (word.length < 3 || STOP_WORDS.has(word)) continue
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }

  return {
    responses: responses.length,
    score: scoreOf(responses),
    promoters: responses.filter((row) => row.score >= 9).length,
    passives: responses.filter((row) => row.score >= 7 && row.score <= 8).length,
    detractors: responses.filter((row) => row.score <= 6).length,
    byRole,
    trend,
    words: [...counts.entries()]
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 40),
    comments: responses
      .filter((row) => row.comment)
      .slice(0, 30)
      .map((row) => ({
        score: row.score,
        role: row.role,
        comment: row.comment!,
        school: row.school.name,
      })),
  }
}
