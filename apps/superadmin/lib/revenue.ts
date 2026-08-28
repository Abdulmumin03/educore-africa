import { Prisma } from "@prisma/client"
import type { PaymentChannel, SchoolPlan, TransactionStatus } from "@prisma/client"

import { prisma } from "@/lib/db"
import { monthlyAmount, REVENUE_STATUSES } from "@/lib/metrics"

// Revenue analytics. Everything here is derived from subscriptions, their
// revision history and the transaction ledger — no figure is stored twice.

export const PLANS: SchoolPlan[] = [
  "STARTER",
  "GROWTH",
  "PROFESSIONAL",
  "ENTERPRISE",
  "GOVERNMENT",
]

export type Range = { from: Date; to: Date }

export function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

/** Named ranges the picker offers. `custom` is handled by the caller. */
export function resolveRange(preset: string, from?: string, to?: string): Range {
  const now = new Date()
  const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59))

  switch (preset) {
    case "qtd": {
      const quarter = Math.floor(now.getUTCMonth() / 3) * 3
      return { from: new Date(Date.UTC(now.getUTCFullYear(), quarter, 1)), to: endOfToday }
    }
    case "ytd":
      return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), to: endOfToday }
    case "12m":
      return {
        from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)),
        to: endOfToday,
      }
    case "custom": {
      const parsedFrom = from ? new Date(from) : monthStart(now)
      const parsedTo = to ? new Date(`${to.slice(0, 10)}T23:59:59Z`) : endOfToday
      return {
        from: Number.isNaN(parsedFrom.getTime()) ? monthStart(now) : parsedFrom,
        to: Number.isNaN(parsedTo.getTime()) ? endOfToday : parsedTo,
      }
    }
    case "mtd":
    default:
      return { from: monthStart(now), to: endOfToday }
  }
}

/**
 * MRR at a point in time.
 *
 * Uses the revision history when a subscription has one — the current amount
 * says nothing about what a school paid six months ago — and falls back to
 * the current amount for subscriptions that have never been revised.
 */
export async function mrrAsOf(at: Date): Promise<number> {
  const subs = await prisma.schoolSubscription.findMany({
    where: {
      startedAt: { lte: at },
      OR: [{ cancelledAt: null }, { cancelledAt: { gt: at } }],
      status: { in: [...REVENUE_STATUSES, "CHURNED"] },
    },
    select: {
      id: true,
      amount: true,
      cycle: true,
      status: true,
      cancelledAt: true,
      revisions: {
        where: { effectiveAt: { lte: at } },
        orderBy: { effectiveAt: "desc" },
        take: 1,
        select: { toMonthly: true, kind: true },
      },
    },
  })

  return subs.reduce((sum, sub) => {
    // Cancelled after `at` still counted; cancelled before is excluded above.
    if (sub.cancelledAt && sub.cancelledAt <= at) return sum
    const revision = sub.revisions[0]
    if (revision) {
      if (revision.kind === "CHURN") return sum
      return sum + Number(revision.toMonthly)
    }
    if (sub.status === "CHURNED") return sum
    return sum + monthlyAmount(Number(sub.amount), sub.cycle)
  }, 0)
}

export type RevenueKpis = {
  mrr: number
  arr: number
  periodRevenue: number
  avgPerSchool: number
  nrr: number | null
  payingSchools: number
  changes: {
    mrr: number | null
    periodRevenue: number | null
    avgPerSchool: number | null
  }
  nrrBreakdown: {
    startingMrr: number
    retainedMrr: number
    expansion: number
    contraction: number
    churned: number
    cohortSize: number
  } | null
}

function pct(now: number, before: number): number | null {
  if (before === 0) return null
  return ((now - before) / before) * 100
}

/**
 * Net revenue retention over the range: what the schools that were already
 * paying at the start are worth now, as a share of what they were worth then.
 * New logos are deliberately excluded — that is the point of the metric.
 */
async function computeNrr(range: Range): Promise<RevenueKpis["nrrBreakdown"]> {
  const cohort = await prisma.schoolSubscription.findMany({
    where: {
      startedAt: { lte: range.from },
      OR: [{ cancelledAt: null }, { cancelledAt: { gt: range.from } }],
    },
    select: {
      id: true,
      amount: true,
      cycle: true,
      status: true,
      cancelledAt: true,
      revisions: { orderBy: { effectiveAt: "asc" }, select: { toMonthly: true, effectiveAt: true, kind: true } },
    },
  })

  if (cohort.length === 0) return null

  let startingMrr = 0
  let retainedMrr = 0
  let expansion = 0
  let contraction = 0
  let churned = 0

  for (const sub of cohort) {
    const atStart = sub.revisions.filter((r) => r.effectiveAt <= range.from).at(-1)
    const before = atStart
      ? Number(atStart.toMonthly)
      : monthlyAmount(Number(sub.amount), sub.cycle)

    const gone = sub.cancelledAt !== null && sub.cancelledAt <= range.to
    const atEnd = sub.revisions.filter((r) => r.effectiveAt <= range.to).at(-1)
    const after = gone
      ? 0
      : atEnd
        ? Number(atEnd.toMonthly)
        : monthlyAmount(Number(sub.amount), sub.cycle)

    startingMrr += before
    retainedMrr += after
    if (after === 0) churned += before
    else if (after > before) expansion += after - before
    else if (after < before) contraction += before - after
  }

  return { startingMrr, retainedMrr, expansion, contraction, churned, cohortSize: cohort.length }
}

export async function revenueKpis(range: Range): Promise<RevenueKpis> {
  const span = range.to.getTime() - range.from.getTime()
  const priorRange: Range = {
    from: new Date(range.from.getTime() - span),
    to: new Date(range.from.getTime() - 1),
  }

  const [subs, periodPaid, priorPaid, mrrNow, mrrBefore, nrrBreakdown] = await Promise.all([
    prisma.schoolSubscription.findMany({
      where: { status: { in: REVENUE_STATUSES } },
      select: { amount: true, cycle: true },
    }),
    prisma.subscriptionTransaction.aggregate({
      where: { status: { in: ["SUCCESSFUL", "PARTIALLY_REFUNDED"] }, paidAt: { gte: range.from, lte: range.to } },
      _sum: { amount: true },
    }),
    prisma.subscriptionTransaction.aggregate({
      where: { status: { in: ["SUCCESSFUL", "PARTIALLY_REFUNDED"] }, paidAt: { gte: priorRange.from, lte: priorRange.to } },
      _sum: { amount: true },
    }),
    mrrAsOf(range.to),
    mrrAsOf(range.from),
    computeNrr(range),
  ])

  const mrr = subs.reduce((sum, row) => sum + monthlyAmount(Number(row.amount), row.cycle), 0)
  const payingSchools = subs.length
  const periodRevenue = Number(periodPaid._sum.amount ?? 0)
  const priorRevenue = Number(priorPaid._sum.amount ?? 0)
  const avgPerSchool = payingSchools > 0 ? mrr / payingSchools : 0

  const nrr =
    nrrBreakdown && nrrBreakdown.startingMrr > 0
      ? (nrrBreakdown.retainedMrr / nrrBreakdown.startingMrr) * 100
      : null

  return {
    mrr,
    arr: mrr * 12,
    periodRevenue,
    avgPerSchool,
    nrr,
    payingSchools,
    changes: {
      mrr: pct(mrrNow, mrrBefore),
      periodRevenue: pct(periodRevenue, priorRevenue),
      avgPerSchool: pct(mrr, mrrBefore),
    },
    nrrBreakdown,
  }
}

export type PeriodPoint = { period: string; label: string; total: number } & Record<string, number | string>

/** MRR per plan tier at the close of each period in the range. */
export async function revenueByPeriod(
  range: Range,
  granularity: "monthly" | "weekly" = "monthly",
): Promise<PeriodPoint[]> {
  // Same population as MRR, or the last point of this chart would disagree
  // with the MRR card sitting directly above it. CHURNED is included so a
  // school still contributes to the months before it cancelled and drops off
  // afterwards; TRIAL and SUSPENDED never contribute, because they are not
  // collecting.
  const subs = await prisma.schoolSubscription.findMany({
    where: { status: { in: [...REVENUE_STATUSES, "CHURNED"] } },
    select: {
      plan: true,
      amount: true,
      cycle: true,
      startedAt: true,
      cancelledAt: true,
      revisions: { orderBy: { effectiveAt: "asc" }, select: { toMonthly: true, effectiveAt: true, toPlan: true } },
    },
  })

  const cutoffs: Date[] = []
  if (granularity === "weekly") {
    for (let at = new Date(range.from); at <= range.to; at = new Date(at.getTime() + 7 * 86_400_000)) {
      cutoffs.push(new Date(at))
    }
  } else {
    const cursor = monthStart(range.from)
    while (cursor <= range.to) {
      // End of that month, or the range end if it falls inside.
      const end = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 23, 59, 59))
      cutoffs.push(end > range.to ? new Date(range.to) : end)
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
  }

  return cutoffs.map((at) => {
    const point: PeriodPoint = {
      period: at.toISOString().slice(0, 10),
      label: at.toLocaleDateString("en-GB", {
        month: "short",
        ...(granularity === "weekly" ? { day: "2-digit" } : {}),
        timeZone: "UTC",
      }),
      total: 0,
    }
    for (const plan of PLANS) point[plan] = 0

    for (const sub of subs) {
      if (sub.startedAt > at) continue
      if (sub.cancelledAt && sub.cancelledAt <= at) continue

      const revision = sub.revisions.filter((r) => r.effectiveAt <= at).at(-1)
      const monthly = revision ? Number(revision.toMonthly) : monthlyAmount(Number(sub.amount), sub.cycle)
      const plan = revision?.toPlan ?? sub.plan

      point[plan] = (Number(point[plan]) || 0) + monthly
      point.total += monthly
    }

    return point
  })
}

export async function revenueByState(limit = 10) {
  const subs = await prisma.schoolSubscription.findMany({
    where: { status: { in: REVENUE_STATUSES } },
    select: {
      plan: true,
      amount: true,
      cycle: true,
      school: { select: { state: true } },
    },
  })

  const priorMonth = new Date()
  priorMonth.setUTCMonth(priorMonth.getUTCMonth() - 1)

  const agg = new Map<string, { schools: number; mrr: number; plans: Map<SchoolPlan, number> }>()
  for (const sub of subs) {
    const state = sub.school.state?.trim() || "Unspecified"
    const bucket = agg.get(state) ?? { schools: 0, mrr: 0, plans: new Map() }
    bucket.schools += 1
    bucket.mrr += monthlyAmount(Number(sub.amount), sub.cycle)
    bucket.plans.set(sub.plan, (bucket.plans.get(sub.plan) ?? 0) + 1)
    agg.set(state, bucket)
  }

  const totalMrr = [...agg.values()].reduce((sum, row) => sum + row.mrr, 0)

  const rows = [...agg.entries()]
    .map(([state, bucket]) => ({
      state,
      schools: bucket.schools,
      mrr: bucket.mrr,
      share: totalMrr > 0 ? (bucket.mrr / totalMrr) * 100 : 0,
      topPlan: [...bucket.plans.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    }))
    .sort((a, b) => b.mrr - a.mrr)

  return {
    rows: rows.slice(0, limit),
    totalStates: rows.length,
    totalMrr,
    shownMrr: rows.slice(0, limit).reduce((sum, row) => sum + row.mrr, 0),
  }
}

export async function churnAnalysis(range: Range) {
  const months: Array<{ month: string; label: string; churned: number; rate: number; active: number }> = []
  const cursor = monthStart(range.from)

  while (cursor <= range.to) {
    const start = new Date(cursor)
    const end = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))

    const [churned, activeAtStart] = await Promise.all([
      prisma.schoolSubscription.count({
        where: { status: "CHURNED", cancelledAt: { gte: start, lt: end } },
      }),
      prisma.schoolSubscription.count({
        where: {
          startedAt: { lt: start },
          OR: [{ cancelledAt: null }, { cancelledAt: { gte: start } }],
        },
      }),
    ])

    months.push({
      month: start.toISOString().slice(0, 7),
      label: start.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
      churned,
      active: activeAtStart,
      rate: activeAtStart > 0 ? (churned / activeAtStart) * 100 : 0,
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  const recent = await prisma.schoolSubscription.findMany({
    where: { status: "CHURNED", cancelledAt: { gte: range.from, lte: range.to } },
    orderBy: { cancelledAt: "desc" },
    take: 10,
    select: {
      id: true,
      plan: true,
      amount: true,
      cycle: true,
      startedAt: true,
      cancelledAt: true,
      churnReason: true,
      schoolId: true,
      school: { select: { name: true } },
    },
  })

  return {
    months,
    recent: recent.map((sub) => {
      const monthly = monthlyAmount(Number(sub.amount), sub.cycle)
      const lifetimeMonths = sub.cancelledAt
        ? Math.max(1, Math.round((sub.cancelledAt.getTime() - sub.startedAt.getTime()) / (30 * 86_400_000)))
        : 1
      return {
        schoolId: sub.schoolId,
        school: sub.school.name,
        plan: sub.plan,
        // Lifetime value = what they actually paid us over their life.
        ltv: monthly * lifetimeMonths,
        lifetimeMonths,
        reason: sub.churnReason,
        churnedAt: sub.cancelledAt?.toISOString() ?? null,
      }
    }),
    totalChurned: months.reduce((sum, month) => sum + month.churned, 0),
  }
}

export type TransactionFilters = {
  page?: number
  limit?: number
  search?: string
  status?: TransactionStatus
  gateway?: PaymentChannel
  schoolId?: string
  from?: Date
  to?: Date
}

export async function listTransactions(filters: TransactionFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(200, Math.max(1, filters.limit ?? 25))

  const where: Prisma.SubscriptionTransactionWhereInput = {}
  if (filters.status) where.status = filters.status
  if (filters.gateway) where.gateway = filters.gateway
  if (filters.schoolId) where.schoolId = filters.schoolId
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    }
  }
  if (filters.search) {
    where.OR = [
      { reference: { contains: filters.search, mode: "insensitive" } },
      { gatewayRef: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
      { school: { name: { contains: filters.search, mode: "insensitive" } } },
    ]
  }

  const [total, rows, totals] = await Promise.all([
    prisma.subscriptionTransaction.count({ where }),
    prisma.subscriptionTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        description: true,
        amount: true,
        currency: true,
        gateway: true,
        status: true,
        reference: true,
        gatewayRef: true,
        failureReason: true,
        attempts: true,
        paidAt: true,
        dueDate: true,
        createdAt: true,
        schoolId: true,
        school: { select: { name: true, slug: true } },
        refunds: { select: { id: true, amount: true, status: true } },
      },
    }),
    prisma.subscriptionTransaction.groupBy({ by: ["status"], where, _sum: { amount: true }, _count: { _all: true } }),
  ])

  return {
    rows: rows.map((row) => ({
      id: row.id,
      description: row.description,
      amount: Number(row.amount),
      currency: row.currency,
      gateway: row.gateway,
      status: row.status,
      reference: row.reference,
      gatewayRef: row.gatewayRef,
      failureReason: row.failureReason,
      attempts: row.attempts,
      paidAt: row.paidAt?.toISOString() ?? null,
      dueDate: row.dueDate?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      schoolId: row.schoolId,
      school: row.school.name,
      schoolSlug: row.school.slug,
      refunded: row.refunds
        .filter((refund) => refund.status === "COMPLETED")
        .reduce((sum, refund) => sum + Number(refund.amount), 0),
    })),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    totals: Object.fromEntries(
      totals.map((row) => [row.status, { count: row._count._all, amount: Number(row._sum.amount ?? 0) }]),
    ),
  }
}

export async function failedPayments() {
  const rows = await prisma.subscriptionTransaction.findMany({
    where: { status: "FAILED", resolvedAt: null },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      amount: true,
      gateway: true,
      failureReason: true,
      attempts: true,
      lastAttemptAt: true,
      dueDate: true,
      createdAt: true,
      remindersSent: true,
      lastReminderAt: true,
      schoolId: true,
      school: {
        select: { name: true, slug: true, subscription: { select: { plan: true, status: true } } },
      },
    },
  })

  const now = Date.now()
  const items = rows.map((row) => {
    const reference = row.dueDate ?? row.createdAt
    return {
      id: row.id,
      schoolId: row.schoolId,
      school: row.school.name,
      schoolSlug: row.school.slug,
      plan: row.school.subscription?.plan ?? null,
      subscriptionStatus: row.school.subscription?.status ?? null,
      amount: Number(row.amount),
      gateway: row.gateway,
      failureReason: row.failureReason ?? "Unknown",
      attempts: row.attempts,
      lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
      daysOverdue: Math.max(0, Math.floor((now - reference.getTime()) / 86_400_000)),
      remindersSent: row.remindersSent,
      lastReminderAt: row.lastReminderAt?.toISOString() ?? null,
    }
  })

  const schools = new Set(items.map((item) => item.schoolId))

  return {
    items,
    totalOutstanding: items.reduce((sum, item) => sum + item.amount, 0),
    schoolCount: schools.size,
    avgDaysOverdue:
      items.length > 0
        ? Math.round(items.reduce((sum, item) => sum + item.daysOverdue, 0) / items.length)
        : 0,
  }
}

export type CohortRow = {
  cohort: string
  label: string
  size: number
  retention: Array<number | null>
}

/**
 * Retention by signup month. A school counts as retained in month N if its
 * subscription had not been cancelled by the end of that month.
 */
export async function cohortRetention(monthsBack = 12): Promise<{
  cohorts: CohortRow[]
  periods: number
}> {
  const now = new Date()
  const firstCohort = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1))

  const subs = await prisma.schoolSubscription.findMany({
    where: { startedAt: { gte: firstCohort } },
    select: { startedAt: true, cancelledAt: true },
  })

  const buckets = new Map<string, Array<{ startedAt: Date; cancelledAt: Date | null }>>()
  for (const sub of subs) {
    const key = monthStart(sub.startedAt).toISOString().slice(0, 7)
    const list = buckets.get(key) ?? []
    list.push(sub)
    buckets.set(key, list)
  }

  const cohorts: CohortRow[] = []
  for (let back = monthsBack - 1; back >= 0; back--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    const key = start.toISOString().slice(0, 7)
    const members = buckets.get(key) ?? []

    const retention: Array<number | null> = []
    for (let period = 0; period <= monthsBack; period++) {
      if (members.length === 0) {
        retention.push(null)
        continue
      }
      // Month 0 is the cohort itself: everyone is present at signup, by
      // definition. Measuring "alive at the end of month 0" instead would
      // punish a cohort for a school that signed up and left inside the same
      // month, which is a month-1 loss, not a month-0 one.
      if (period === 0) {
        retention.push(100)
        continue
      }
      // A period only exists once that month has actually elapsed.
      const periodEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + period + 1, 0, 23, 59, 59))
      if (periodEnd > now || period > back) {
        retention.push(null)
        continue
      }
      const alive = members.filter(
        (member) => !member.cancelledAt || member.cancelledAt > periodEnd,
      ).length
      retention.push((alive / members.length) * 100)
    }

    cohorts.push({
      cohort: key,
      label: start.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }),
      size: members.length,
      retention,
    })
  }

  return { cohorts, periods: monthsBack }
}
