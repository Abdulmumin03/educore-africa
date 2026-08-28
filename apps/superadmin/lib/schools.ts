import { Prisma } from "@prisma/client"
import type { ChurnRiskLevel, SchoolPlan, SubscriptionStatus } from "@prisma/client"

import { prisma } from "@/lib/db"
import { healthScore } from "@/lib/health"
import { monthlyAmount } from "@/lib/metrics"

// The eight modules a school can be using. Health scores adoption breadth
// against this list, so adding a module here changes every score — keep it
// stable unless the product genuinely gains a module.
const MODULE_TABLES = [
  "attendance",
  "grades",
  "fee_invoices",
  "announcements",
  "lesson_plans",
  "libraries",
  "bus_routes",
  "visitor_logs",
] as const

export const TOTAL_MODULES = MODULE_TABLES.length

export type SchoolListParams = {
  page?: number
  limit?: number
  search?: string
  state?: string
  plan?: SchoolPlan
  status?: SubscriptionStatus
  from?: Date
  to?: Date
  sort?: "name" | "students" | "mrr" | "health" | "created"
}

export type SchoolRow = {
  id: string
  name: string
  slug: string
  state: string | null
  country: string
  email: string | null
  plan: SchoolPlan | null
  status: SubscriptionStatus | null
  students: number
  staff: number
  mrr: number
  lastActiveAt: string | null
  health: number
  /** Latest weekly churn verdict, or null where the school has never been scored. */
  churnLevel: ChurnRiskLevel | null
  churnScore: number | null
  createdAt: string
}

export const PAGE_SIZE = 25

function buildWhere(params: SchoolListParams): Prisma.SchoolWhereInput {
  const where: Prisma.SchoolWhereInput = { deletedAt: null }

  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { slug: { contains: params.search, mode: "insensitive" } },
      { state: { contains: params.search, mode: "insensitive" } },
      { email: { contains: params.search, mode: "insensitive" } },
    ]
  }
  if (params.state) where.state = { equals: params.state, mode: "insensitive" }
  if (params.plan || params.status) {
    where.subscription = {
      ...(params.plan ? { plan: params.plan } : {}),
      ...(params.status ? { status: params.status } : {}),
    }
  }
  if (params.from || params.to) {
    where.createdAt = {
      ...(params.from ? { gte: params.from } : {}),
      ...(params.to ? { lte: params.to } : {}),
    }
  }

  return where
}

type Derived = {
  lastActive: Date | null
  billed: number
  collected: number
  criticalTickets: number
  modulesInUse: number
}

/**
 * Per-school signals for the health score, in ONE round trip.
 *
 * Prisma cannot express "does this school have any row in eight different
 * tables" without eight queries, so this drops to SQL: correlated EXISTS
 * subqueries are index-only and cheap, and the alternative was 8 × page-size
 * queries per render.
 */
async function derivedSignals(schoolIds: string[]): Promise<Map<string, Derived>> {
  if (schoolIds.length === 0) return new Map()

  const moduleSum = Prisma.join(
    MODULE_TABLES.map(
      (table) =>
        Prisma.sql`(CASE WHEN EXISTS (SELECT 1 FROM ${Prisma.raw(`"${table}"`)} t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END)`,
    ),
    " + ",
  )

  const rows = await prisma.$queryRaw<
    Array<{
      id: string
      last_active: Date | null
      billed: Prisma.Decimal | null
      collected: Prisma.Decimal | null
      critical_tickets: bigint
      modules_in_use: bigint
    }>
  >`
    SELECT
      s."id",
      (SELECT max(u."last_login_at") FROM "users" u
        WHERE u."school_id" = s."id" AND u."deleted_at" IS NULL) AS last_active,
      (SELECT coalesce(sum(i."amount_due"), 0) FROM "fee_invoices" i
        WHERE i."school_id" = s."id" AND i."deleted_at" IS NULL) AS billed,
      (SELECT coalesce(sum(i."amount_paid"), 0) FROM "fee_invoices" i
        WHERE i."school_id" = s."id" AND i."deleted_at" IS NULL) AS collected,
      (SELECT count(*) FROM "support_tickets" t
        WHERE t."school_id" = s."id" AND t."priority" = 'CRITICAL'
          AND t."status" IN ('OPEN', 'IN_PROGRESS')) AS critical_tickets,
      (${moduleSum}) AS modules_in_use
    FROM "schools" s
    WHERE s."id" IN (${Prisma.join(schoolIds)})
  `

  return new Map(
    rows.map((row) => [
      row.id,
      {
        lastActive: row.last_active,
        billed: Number(row.billed ?? 0),
        collected: Number(row.collected ?? 0),
        criticalTickets: Number(row.critical_tickets),
        modulesInUse: Number(row.modules_in_use),
      },
    ]),
  )
}

export async function listSchools(params: SchoolListParams): Promise<{
  rows: SchoolRow[]
  total: number
  page: number
  limit: number
  pages: number
}> {
  const page = Math.max(1, params.page ?? 1)
  const limit = Math.min(100, Math.max(1, params.limit ?? PAGE_SIZE))
  const where = buildWhere(params)

  // Sorting by mrr or health cannot be pushed into SQL (both are derived), so
  // those two sort the page in memory and the UI says so.
  const orderBy: Prisma.SchoolOrderByWithRelationInput =
    params.sort === "students"
      ? { students: { _count: "desc" } }
      : params.sort === "created"
        ? { createdAt: "desc" }
        : { name: "asc" }

  const [total, schools] = await Promise.all([
    prisma.school.count({ where }),
    prisma.school.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        slug: true,
        state: true,
        country: true,
        email: true,
        createdAt: true,
        subscription: { select: { plan: true, status: true, amount: true, cycle: true } },
        _count: {
          select: {
            students: { where: { deletedAt: null } },
            staff: { where: { deletedAt: null } },
          },
        },
      },
    }),
  ])

  const ids = schools.map((school) => school.id)
  const [signals, churnRows] = await Promise.all([
    derivedSignals(ids),
    // One query for the page, not one per row. A school with no row here has
    // simply never been scored, which the badge says rather than guessing LOW.
    prisma.churnRiskScore.findMany({
      where: { isLatest: true, schoolId: { in: ids } },
      select: { schoolId: true, level: true, score: true },
    }),
  ])
  const churn = new Map(churnRows.map((row) => [row.schoolId, row]))

  const rows: SchoolRow[] = schools.map((school) => {
    const derived = signals.get(school.id)
    const collectionRate =
      derived && derived.billed > 0 ? Math.min(1, derived.collected / derived.billed) : null

    return {
      id: school.id,
      name: school.name,
      slug: school.slug,
      state: school.state,
      country: school.country,
      email: school.email,
      plan: school.subscription?.plan ?? null,
      status: school.subscription?.status ?? null,
      students: school._count.students,
      staff: school._count.staff,
      mrr: school.subscription
        ? monthlyAmount(Number(school.subscription.amount), school.subscription.cycle)
        : 0,
      lastActiveAt: derived?.lastActive?.toISOString() ?? null,
      health: healthScore({
        lastActiveAt: derived?.lastActive ?? null,
        collectionRate,
        modulesInUse: derived?.modulesInUse ?? 0,
        totalModules: TOTAL_MODULES,
        subscriptionStatus: school.subscription?.status ?? null,
        openCriticalTickets: derived?.criticalTickets ?? 0,
      }),
      churnLevel: churn.get(school.id)?.level ?? null,
      churnScore: churn.get(school.id)?.score ?? null,
      createdAt: school.createdAt.toISOString(),
    }
  })

  if (params.sort === "mrr") rows.sort((a, b) => b.mrr - a.mrr)
  if (params.sort === "health") rows.sort((a, b) => a.health - b.health)

  return { rows, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) }
}

/** Counts for the status strip above the directory. */
export async function schoolStatusCounts(): Promise<Record<string, number>> {
  const [all, grouped] = await Promise.all([
    prisma.school.count({ where: { deletedAt: null } }),
    prisma.schoolSubscription.groupBy({ by: ["status"], _count: { _all: true } }),
  ])

  const counts: Record<string, number> = { ALL: all }
  for (const status of ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CHURNED"]) counts[status] = 0
  for (const row of grouped) counts[row.status] = row._count._all
  return counts
}

/** Distinct states, for the filter dropdown. */
export async function schoolStates(): Promise<string[]> {
  const rows = await prisma.school.findMany({
    where: { deletedAt: null, state: { not: null } },
    distinct: ["state"],
    orderBy: { state: "asc" },
    select: { state: true },
  })
  return rows.map((row) => row.state).filter((state): state is string => Boolean(state))
}

/** Full detail for one school, including everything the profile header needs. */
export async function getSchoolDetail(schoolId: string) {
  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      address: true,
      city: true,
      state: true,
      country: true,
      phone: true,
      email: true,
      website: true,
      currency: true,
      accreditationNumber: true,
      ministryRegNumber: true,
      isActive: true,
      createdAt: true,
      subscription: true,
      curricula: { where: { deletedAt: null }, select: { name: true, code: true } },
      _count: {
        select: {
          students: { where: { deletedAt: null } },
          staff: { where: { deletedAt: null } },
          users: { where: { deletedAt: null } },
        },
      },
    },
  })

  if (!school) return null

  const signals = await derivedSignals([school.id])
  const derived = signals.get(school.id)
  const collectionRate =
    derived && derived.billed > 0 ? Math.min(1, derived.collected / derived.billed) : null

  return {
    ...school,
    mrr: school.subscription
      ? monthlyAmount(Number(school.subscription.amount), school.subscription.cycle)
      : 0,
    lastActiveAt: derived?.lastActive ?? null,
    collectionRate,
    modulesInUse: derived?.modulesInUse ?? 0,
    totalModules: TOTAL_MODULES,
    openCriticalTickets: derived?.criticalTickets ?? 0,
    health: healthScore({
      lastActiveAt: derived?.lastActive ?? null,
      collectionRate,
      modulesInUse: derived?.modulesInUse ?? 0,
      totalModules: TOTAL_MODULES,
      subscriptionStatus: school.subscription?.status ?? null,
      openCriticalTickets: derived?.criticalTickets ?? 0,
    }),
  }
}

/** Per-module usage for the Overview tab's adoption bars. */
export async function featureAdoption(schoolId: string): Promise<
  Array<{ module: string; label: string; rows: number; inUse: boolean }>
> {
  const labels: Record<(typeof MODULE_TABLES)[number], string> = {
    attendance: "Attendance",
    grades: "Grades",
    fee_invoices: "Finance",
    announcements: "Communication",
    lesson_plans: "Lessons",
    libraries: "Library",
    bus_routes: "Transport",
    visitor_logs: "Visitors",
  }

  const counts = Prisma.join(
    MODULE_TABLES.map(
      (table) =>
        Prisma.sql`(SELECT count(*) FROM ${Prisma.raw(`"${table}"`)} t WHERE t."school_id" = ${schoolId})`,
    ),
    ", ",
  )

  const [row] = await prisma.$queryRaw<Array<Record<string, bigint>>>`SELECT ${counts}`
  const values = Object.values(row ?? {}).map((value) => Number(value))

  return MODULE_TABLES.map((table, index) => ({
    module: table,
    label: labels[table],
    rows: values[index] ?? 0,
    inUse: (values[index] ?? 0) > 0,
  }))
}
