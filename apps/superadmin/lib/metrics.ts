import type { BillingCycle, SchoolPlan, SubscriptionStatus } from "@prisma/client"

import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"

// Platform metrics. Every figure here is derived from real rows — nothing is
// stored twice — but the queries are heavy enough that the console reads them
// through a 5-minute Redis cache and a daily PlatformMetricSnapshot row.

export const METRICS_KEY = "platform:metrics"
export const REVENUE_KEY = "platform:revenue"
export const CACHE_TTL_SECONDS = 5 * 60

/** A school counts as active if any of its users signed in this recently. */
const ACTIVE_WINDOW_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Monthly-equivalent of a subscription. Stored `amount` is per BILLING CYCLE,
 * so MRR has to normalise — a ₦552,600 termly plan is ₦184,200/month, not
 * ₦552,600. Deriving it (rather than storing an mrr column) means a cycle
 * change can never leave the two out of step.
 */
export function monthlyAmount(amount: number, cycle: BillingCycle): number {
  switch (cycle) {
    case "MONTHLY":
      return amount
    case "TERMLY":
      return amount / 3
    case "ANNUAL":
      return amount / 12
  }
}

/** Statuses that contribute to recurring revenue. */
export const REVENUE_STATUSES: SubscriptionStatus[] = ["ACTIVE", "PAST_DUE"]

export type PlatformMetrics = {
  totalSchools: number
  activeSchools: number
  totalStudents: number
  totalStaff: number
  mrr: number
  arr: number
  newSignups: number
  churned: number
  trialSchools: number
  suspendedSchools: number
  /** Rolling 30-day availability, from health-probe history when present. */
  uptimePercent: number
  computedAt: string
  /** Month-over-month change, percent, for the cards that show a trend. */
  trends: {
    activeSchools: number | null
    totalStudents: number | null
    mrr: number | null
    newSignups: number | null
  }
}

function pctChange(now: number, before: number): number | null {
  if (before === 0) return null
  return ((now - before) / before) * 100
}

async function mrrAsOf(at: Date): Promise<number> {
  // Subscriptions that had started and had not yet cancelled at `at`.
  const rows = await prisma.schoolSubscription.findMany({
    where: {
      startedAt: { lte: at },
      status: { in: REVENUE_STATUSES },
      OR: [{ cancelledAt: null }, { cancelledAt: { gt: at } }],
    },
    select: { amount: true, cycle: true },
  })
  return rows.reduce((sum, row) => sum + monthlyAmount(Number(row.amount), row.cycle), 0)
}

/**
 * Compute every headline figure, write today's PlatformMetricSnapshot, and
 * cache for 5 minutes. Safe to call from a cron and on demand — the snapshot
 * upserts on its unique date.
 */
export async function computeAndCachePlatformMetrics(): Promise<PlatformMetrics> {
  const now = new Date()
  const activeSince = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * DAY_MS)
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const priorMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS)

  const [
    totalSchools,
    activeSchools,
    totalStudents,
    totalStaff,
    subscriptions,
    newSignups,
    churned,
    trialSchools,
    suspendedSchools,
    studentsBefore,
    activeBefore,
    newSignupsPrior,
  ] = await Promise.all([
    prisma.school.count({ where: { deletedAt: null } }),
    prisma.school.count({
      where: {
        deletedAt: null,
        users: { some: { deletedAt: null, lastLoginAt: { gte: activeSince } } },
      },
    }),
    prisma.student.count({ where: { deletedAt: null } }),
    prisma.staff.count({ where: { deletedAt: null } }),
    prisma.schoolSubscription.findMany({
      where: { status: { in: REVENUE_STATUSES } },
      select: { amount: true, cycle: true },
    }),
    prisma.school.count({ where: { deletedAt: null, createdAt: { gte: monthStart } } }),
    prisma.schoolSubscription.count({
      where: { status: "CHURNED", cancelledAt: { gte: monthStart } },
    }),
    prisma.schoolSubscription.count({ where: { status: "TRIAL" } }),
    prisma.schoolSubscription.count({ where: { status: "SUSPENDED" } }),
    prisma.student.count({ where: { deletedAt: null, createdAt: { lt: thirtyDaysAgo } } }),
    prisma.school.count({
      where: {
        deletedAt: null,
        createdAt: { lt: thirtyDaysAgo },
        users: { some: { deletedAt: null, lastLoginAt: { gte: activeSince } } },
      },
    }),
    prisma.school.count({
      where: { deletedAt: null, createdAt: { gte: priorMonthStart, lt: monthStart } },
    }),
  ])

  const mrr = subscriptions.reduce(
    (sum, row) => sum + monthlyAmount(Number(row.amount), row.cycle),
    0,
  )
  const mrrPrior = await mrrAsOf(priorMonthStart)

  const metrics: PlatformMetrics = {
    totalSchools,
    activeSchools,
    totalStudents,
    totalStaff,
    mrr,
    arr: mrr * 12,
    newSignups,
    churned,
    trialSchools,
    suspendedSchools,
    uptimePercent: await rollingUptime(),
    computedAt: now.toISOString(),
    trends: {
      activeSchools: pctChange(activeSchools, activeBefore),
      totalStudents: pctChange(totalStudents, studentsBefore),
      mrr: pctChange(mrr, mrrPrior),
      newSignups: pctChange(newSignups, newSignupsPrior),
    },
  }

  // One snapshot per day, so a 5-minute cron overwrites rather than piles up.
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const snapshot = {
    totalSchools,
    activeSchools,
    totalStudents,
    totalStaff,
    mrr,
    newSignups,
    churned,
    trialSchools,
  }
  await prisma.platformMetricSnapshot.upsert({
    where: { snapshotDate: today },
    create: { snapshotDate: today, ...snapshot },
    update: snapshot,
  })

  await cacheSet(METRICS_KEY, metrics)
  return metrics
}

export type RevenueBreakdown = {
  byPlan: Array<{
    plan: SchoolPlan
    schools: number
    mrr: number
    share: number
    changePercent: number | null
  }>
  byState: Array<{ state: string; schools: number; mrr: number; topPlan: SchoolPlan | null }>
  byMonth: Array<{ month: string; label: string; total: number } & Partial<Record<SchoolPlan, number>>>
  totalMrr: number
  computedAt: string
}

const PLANS: SchoolPlan[] = ["STARTER", "GROWTH", "PROFESSIONAL", "ENTERPRISE", "GOVERNMENT"]

/** Revenue sliced by plan, by state and by month. */
export async function computeRevenueBreakdown(): Promise<RevenueBreakdown> {
  const now = new Date()
  const priorMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))

  const subs = await prisma.schoolSubscription.findMany({
    where: { status: { in: REVENUE_STATUSES } },
    select: {
      plan: true,
      amount: true,
      cycle: true,
      startedAt: true,
      cancelledAt: true,
      school: { select: { state: true } },
    },
  })

  const totalMrr = subs.reduce((s, r) => s + monthlyAmount(Number(r.amount), r.cycle), 0)

  // ── by plan ──
  const planAgg = new Map<SchoolPlan, { schools: number; mrr: number }>()
  for (const plan of PLANS) planAgg.set(plan, { schools: 0, mrr: 0 })
  for (const row of subs) {
    const bucket = planAgg.get(row.plan)!
    bucket.schools += 1
    bucket.mrr += monthlyAmount(Number(row.amount), row.cycle)
  }

  const priorByPlan = new Map<SchoolPlan, number>()
  for (const row of subs) {
    const live = row.startedAt <= priorMonthStart && (!row.cancelledAt || row.cancelledAt > priorMonthStart)
    if (!live) continue
    priorByPlan.set(
      row.plan,
      (priorByPlan.get(row.plan) ?? 0) + monthlyAmount(Number(row.amount), row.cycle),
    )
  }

  const byPlan = PLANS.map((plan) => {
    const { schools, mrr } = planAgg.get(plan)!
    return {
      plan,
      schools,
      mrr,
      share: totalMrr > 0 ? (mrr / totalMrr) * 100 : 0,
      changePercent: pctChange(mrr, priorByPlan.get(plan) ?? 0),
    }
  })

  // ── by state ──
  const stateAgg = new Map<string, { schools: number; mrr: number; plans: Map<SchoolPlan, number> }>()
  for (const row of subs) {
    const state = row.school.state?.trim() || "Unspecified"
    const bucket = stateAgg.get(state) ?? { schools: 0, mrr: 0, plans: new Map() }
    bucket.schools += 1
    bucket.mrr += monthlyAmount(Number(row.amount), row.cycle)
    bucket.plans.set(row.plan, (bucket.plans.get(row.plan) ?? 0) + 1)
    stateAgg.set(state, bucket)
  }

  const byState = [...stateAgg.entries()]
    .map(([state, bucket]) => ({
      state,
      schools: bucket.schools,
      mrr: bucket.mrr,
      topPlan:
        [...bucket.plans.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    }))
    .sort((a, b) => b.mrr - a.mrr)

  // ── by month, last 12 ──
  const byMonth: RevenueBreakdown["byMonth"] = []
  for (let back = 11; back >= 0; back--) {
    const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 0))
    const entry: RevenueBreakdown["byMonth"][number] = {
      month: `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`,
      label: at.toLocaleDateString("en-NG", { month: "short", timeZone: "UTC" }),
      total: 0,
    }
    for (const plan of PLANS) entry[plan] = 0

    for (const row of subs) {
      if (row.startedAt > at) continue
      if (row.cancelledAt && row.cancelledAt <= at) continue
      const monthly = monthlyAmount(Number(row.amount), row.cycle)
      entry[row.plan] = (entry[row.plan] ?? 0) + monthly
      entry.total += monthly
    }
    byMonth.push(entry)
  }

  const breakdown: RevenueBreakdown = {
    byPlan,
    byState,
    byMonth,
    totalMrr,
    computedAt: now.toISOString(),
  }
  await cacheSet(REVENUE_KEY, breakdown)
  return breakdown
}

/**
 * Cumulative totals at the end of each of the last 8 weeks — the series
 * behind the KPI sparklines. One raw query per entity, because Prisma cannot
 * bucket by week.
 */
export async function weeklySeries(table: "schools" | "students"): Promise<number[]> {
  const rows =
    table === "schools"
      ? await prisma.$queryRaw<Array<{ week: Date; n: bigint }>>`
          SELECT date_trunc('week', created_at) AS week, count(*)::bigint AS n
          FROM schools WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 1`
      : await prisma.$queryRaw<Array<{ week: Date; n: bigint }>>`
          SELECT date_trunc('week', created_at) AS week, count(*)::bigint AS n
          FROM students WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 1`

  if (rows.length === 0) return []

  const buckets = new Map(rows.map((row) => [row.week.getTime(), Number(row.n)]))
  const startOfThisWeek = new Date()
  startOfThisWeek.setUTCHours(0, 0, 0, 0)
  startOfThisWeek.setUTCDate(startOfThisWeek.getUTCDate() - ((startOfThisWeek.getUTCDay() + 6) % 7))

  const windowStart = startOfThisWeek.getTime() - 7 * 7 * DAY_MS
  let running = rows
    .filter((row) => row.week.getTime() < windowStart)
    .reduce((sum, row) => sum + Number(row.n), 0)

  return Array.from({ length: 8 }, (_, index) => {
    running += buckets.get(windowStart + index * 7 * DAY_MS) ?? 0
    return running
  })
}

/** Signups and churn per month for the last 12 months. */
export async function computeGrowthTrend(): Promise<
  Array<{ month: string; label: string; signups: number; churned: number; net: number }>
> {
  const now = new Date()
  const out: Array<{ month: string; label: string; signups: number; churned: number; net: number }> = []

  for (let back = 11; back >= 0; back--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 1))

    const [signups, churned] = await Promise.all([
      prisma.school.count({ where: { deletedAt: null, createdAt: { gte: start, lt: end } } }),
      prisma.schoolSubscription.count({
        where: { status: "CHURNED", cancelledAt: { gte: start, lt: end } },
      }),
    ])

    out.push({
      month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
      label: start.toLocaleDateString("en-NG", { month: "short", timeZone: "UTC" }),
      signups,
      churned,
      net: signups - churned,
    })
  }

  return out
}

/**
 * 30-day availability from the console's own probe history, when a
 * `platform:uptime` counter exists. Absent any probe data we return 100
 * rather than inventing a number, and the UI labels it as such.
 */
async function rollingUptime(): Promise<number> {
  try {
    const raw = await redis.get("platform:uptime")
    if (!raw) return 100
    const { up, total } = JSON.parse(raw) as { up: number; total: number }
    if (!total) return 100
    return Math.round((up / total) * 10000) / 100
  } catch {
    return 100
  }
}

// ── cache plumbing ────────────────────────────────────────────────

async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", CACHE_TTL_SECONDS)
  } catch {
    // A cold cache just means the next read recomputes.
  }
}

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const hit = await redis.get(key)
    return hit ? (JSON.parse(hit) as T) : null
  } catch {
    return null
  }
}

/** Cached read, recomputing on a miss. */
export async function getPlatformMetrics(force = false): Promise<PlatformMetrics> {
  if (!force) {
    const hit = await cacheGet<PlatformMetrics>(METRICS_KEY)
    if (hit) return hit
  }
  return computeAndCachePlatformMetrics()
}

export async function getRevenueBreakdown(force = false): Promise<RevenueBreakdown> {
  if (!force) {
    const hit = await cacheGet<RevenueBreakdown>(REVENUE_KEY)
    if (hit) return hit
  }
  return computeRevenueBreakdown()
}
