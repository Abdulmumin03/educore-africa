import { Prisma } from "@prisma/client"
import type { TicketCategory, TicketPriority, TicketStatus } from "@prisma/client"

import { prisma } from "@/lib/db"
import { healthScore } from "@/lib/health"
import { TOTAL_MODULES } from "@/lib/schools"

// Support desk. SLA targets live here rather than in the database: they are
// policy, not data, and a policy change should be a reviewable diff.

const HOUR = 3_600_000

/** First response and resolution targets, in hours, by priority. */
export const SLA_TARGETS: Record<TicketPriority, { firstResponse: number; resolution: number }> = {
  CRITICAL: { firstResponse: 1, resolution: 8 },
  HIGH: { firstResponse: 4, resolution: 24 },
  MEDIUM: { firstResponse: 8, resolution: 72 },
  LOW: { firstResponse: 24, resolution: 168 },
}

export type SlaState = "met" | "ok" | "at-risk" | "breached"

export type SlaTimer = {
  state: SlaState
  /** Negative once the target has passed. */
  msRemaining: number
  targetHours: number
  label: string
  /** Which clock is running: the first-response target or resolution. */
  clock: "first-response" | "resolution" | "done"
}

function humanise(ms: number): string {
  const abs = Math.abs(ms)
  const hours = Math.floor(abs / HOUR)
  const minutes = Math.floor((abs % HOUR) / 60_000)
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days}d ${hours % 24}h`
  }
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/**
 * The live SLA clock for one ticket.
 *
 * Before a first reply, the first-response target is what matters; after it,
 * the resolution target. A resolved ticket freezes — it either met its target
 * or it did not, and that verdict should not keep drifting.
 */
export function slaTimer(ticket: {
  priority: TicketPriority
  status: TicketStatus
  createdAt: Date
  firstResponseAt: Date | null
  resolvedAt: Date | null
}): SlaTimer {
  const targets = SLA_TARGETS[ticket.priority]
  const closed = ticket.status === "RESOLVED" || ticket.status === "CLOSED"

  if (closed) {
    const settledAt = ticket.resolvedAt ?? new Date()
    const took = settledAt.getTime() - ticket.createdAt.getTime()
    const target = targets.resolution * HOUR
    return {
      state: took <= target ? "met" : "breached",
      msRemaining: target - took,
      targetHours: targets.resolution,
      label: took <= target ? `Met in ${humanise(took)}` : `Breached by ${humanise(took - target)}`,
      clock: "done",
    }
  }

  const awaitingFirstReply = ticket.firstResponseAt === null
  const targetHours = awaitingFirstReply ? targets.firstResponse : targets.resolution
  const deadline = ticket.createdAt.getTime() + targetHours * HOUR
  const msRemaining = deadline - Date.now()

  // "At risk" is the last quarter of the window — enough warning to act.
  const state: SlaState =
    msRemaining < 0 ? "breached" : msRemaining < targetHours * HOUR * 0.25 ? "at-risk" : "ok"

  return {
    state,
    msRemaining,
    targetHours,
    label:
      msRemaining < 0
        ? `Breached ${humanise(msRemaining)} ago`
        : `${humanise(msRemaining)} left`,
    clock: awaitingFirstReply ? "first-response" : "resolution",
  }
}

export const SLA_TONE: Record<SlaState, string> = {
  met: "text-sa-green",
  ok: "text-sa-green",
  "at-risk": "text-sa-amber",
  breached: "text-sa-red",
}

export const SLA_DOT: Record<SlaState, string> = {
  met: "bg-sa-green",
  ok: "bg-sa-green",
  "at-risk": "bg-sa-amber",
  breached: "bg-sa-red",
}

export type TicketFilters = {
  status?: TicketStatus | "ALL"
  priority?: TicketPriority
  category?: TicketCategory
  assignedTo?: string | "UNASSIGNED"
  search?: string
  page?: number
  limit?: number
}

export async function listTickets(filters: TicketFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(100, Math.max(1, filters.limit ?? 30))

  const where: Prisma.SupportTicketWhereInput = {}
  if (filters.status && filters.status !== "ALL") where.status = filters.status
  if (filters.priority) where.priority = filters.priority
  if (filters.category) where.category = filters.category
  if (filters.assignedTo === "UNASSIGNED") where.assignedTo = null
  else if (filters.assignedTo) where.assignedTo = filters.assignedTo
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
      { school: { name: { contains: filters.search, mode: "insensitive" } } },
    ]
  }

  const [total, tickets, counts] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      // Unresolved first, then by priority, then oldest — the order an agent
      // should actually work the queue in.
      orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        category: true,
        priority: true,
        status: true,
        assignedTo: true,
        createdAt: true,
        firstResponseAt: true,
        resolvedAt: true,
        escalatedAt: true,
        schoolId: true,
        school: { select: { name: true, slug: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
  ])

  const agentIds = [...new Set(tickets.map((t) => t.assignedTo).filter(Boolean) as string[])]
  const agents = await prisma.superAdminUser.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true },
  })
  const agentById = new Map(agents.map((a) => [a.id, a.name]))

  return {
    tickets: tickets.map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      assignedTo: ticket.assignedTo,
      assignedName: ticket.assignedTo ? (agentById.get(ticket.assignedTo) ?? "Unknown") : null,
      createdAt: ticket.createdAt.toISOString(),
      firstResponseAt: ticket.firstResponseAt?.toISOString() ?? null,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      escalatedAt: ticket.escalatedAt?.toISOString() ?? null,
      schoolId: ticket.schoolId,
      school: ticket.school.name,
      comments: ticket._count.comments,
      sla: slaTimer(ticket),
    })),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    statusCounts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
  }
}

export async function slaDashboard(days = 14) {
  const since = new Date(Date.now() - days * 86_400_000)
  const weekAgo = new Date(Date.now() - 7 * 86_400_000)

  const tickets = await prisma.supportTicket.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      priority: true,
      status: true,
      createdAt: true,
      firstResponseAt: true,
      resolvedAt: true,
      assignedTo: true,
    },
  })

  const responded = tickets.filter((t) => t.firstResponseAt)
  const resolved = tickets.filter((t) => t.resolvedAt)

  const avgFirstResponse =
    responded.length > 0
      ? responded.reduce((sum, t) => sum + (t.firstResponseAt!.getTime() - t.createdAt.getTime()), 0) /
        responded.length
      : null
  const avgResolution =
    resolved.length > 0
      ? resolved.reduce((sum, t) => sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()), 0) /
        resolved.length
      : null

  const judged = tickets.map((t) => slaTimer(t))
  const breached = judged.filter((s) => s.state === "breached").length
  const compliance = judged.length > 0 ? ((judged.length - breached) / judged.length) * 100 : null

  const breachedThisWeek = tickets.filter(
    (t) => t.createdAt >= weekAgo && slaTimer(t).state === "breached",
  ).length

  // Tickets by status per day, for the stacked bar.
  const byDay: Array<{ day: string; label: string } & Record<string, number | string>> = []
  for (let back = days - 1; back >= 0; back--) {
    const start = new Date(Date.now() - back * 86_400_000)
    start.setUTCHours(0, 0, 0, 0)
    const end = new Date(start.getTime() + 86_400_000)
    const slice = tickets.filter((t) => t.createdAt >= start && t.createdAt < end)
    byDay.push({
      day: start.toISOString().slice(0, 10),
      label: start.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }),
      OPEN: slice.filter((t) => t.status === "OPEN").length,
      IN_PROGRESS: slice.filter((t) => t.status === "IN_PROGRESS").length,
      WAITING_ON_CLIENT: slice.filter((t) => t.status === "WAITING_ON_CLIENT").length,
      RESOLVED: slice.filter((t) => t.status === "RESOLVED").length,
      CLOSED: slice.filter((t) => t.status === "CLOSED").length,
    })
  }

  // Agent leaderboard. CSAT has no source — there is no satisfaction survey
  // on tickets — so it is reported as unavailable rather than invented.
  const agentIds = [...new Set(tickets.map((t) => t.assignedTo).filter(Boolean) as string[])]
  const agents = await prisma.superAdminUser.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true, role: true },
  })

  const leaderboard = agents
    .map((agent) => {
      const theirs = tickets.filter((t) => t.assignedTo === agent.id)
      const theirResolved = theirs.filter((t) => t.resolvedAt)
      return {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        assigned: theirs.length,
        resolved: theirResolved.length,
        avgResolutionMs:
          theirResolved.length > 0
            ? theirResolved.reduce(
                (sum, t) => sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()),
                0,
              ) / theirResolved.length
            : null,
        breached: theirs.filter((t) => slaTimer(t).state === "breached").length,
      }
    })
    .sort((a, b) => b.resolved - a.resolved)

  return {
    windowDays: days,
    totals: { tickets: tickets.length, responded: responded.length, resolved: resolved.length },
    avgFirstResponseMs: avgFirstResponse,
    avgResolutionMs: avgResolution,
    compliancePercent: compliance,
    breachedThisWeek,
    byDay,
    leaderboard,
    csatAvailable: false,
  }
}

export type AtRiskSchool = {
  schoolId: string
  school: string
  health: number
  reasons: string[]
  lastLoginAt: string | null
  openTickets: number
  daysOverdue: number
  mrr: number
}

/**
 * Schools worth a call. Four independent signals; a school qualifies on any
 * one of them, and the row says which fired.
 */
export async function atRiskSchools(): Promise<AtRiskSchool[]> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000)

  const rows = await prisma.$queryRaw<
    Array<{
      id: string
      name: string
      last_active: Date | null
      open_tickets: bigint
      billed: Prisma.Decimal | null
      collected: Prisma.Decimal | null
      critical_tickets: bigint
      modules_in_use: bigint
      status: string | null
      oldest_overdue: Date | null
    }>
  >`
    SELECT
      s."id", s."name",
      (SELECT max(u."last_login_at") FROM "users" u WHERE u."school_id" = s."id" AND u."deleted_at" IS NULL) AS last_active,
      (SELECT count(*) FROM "support_tickets" t WHERE t."school_id" = s."id" AND t."status" IN ('OPEN','IN_PROGRESS')) AS open_tickets,
      (SELECT coalesce(sum(i."amount_due"),0) FROM "fee_invoices" i WHERE i."school_id" = s."id" AND i."deleted_at" IS NULL) AS billed,
      (SELECT coalesce(sum(i."amount_paid"),0) FROM "fee_invoices" i WHERE i."school_id" = s."id" AND i."deleted_at" IS NULL) AS collected,
      (SELECT count(*) FROM "support_tickets" t WHERE t."school_id" = s."id" AND t."priority" = 'CRITICAL' AND t."status" IN ('OPEN','IN_PROGRESS')) AS critical_tickets,
      (CASE WHEN EXISTS (SELECT 1 FROM "attendance" a WHERE a."school_id" = s."id") THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM "grades" g WHERE g."school_id" = s."id") THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM "fee_invoices" f WHERE f."school_id" = s."id") THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM "announcements" n WHERE n."school_id" = s."id") THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM "lesson_plans" l WHERE l."school_id" = s."id") THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM "libraries" b WHERE b."school_id" = s."id") THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM "bus_routes" r WHERE r."school_id" = s."id") THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM "visitor_logs" v WHERE v."school_id" = s."id") THEN 1 ELSE 0 END) AS modules_in_use,
      sub."status"::text AS status,
      (SELECT min(tx."due_date") FROM "subscription_transactions" tx
        WHERE tx."school_id" = s."id" AND tx."status" = 'FAILED' AND tx."resolved_at" IS NULL) AS oldest_overdue
    FROM "schools" s
    LEFT JOIN "school_subscriptions" sub ON sub."school_id" = s."id"
    WHERE s."deleted_at" IS NULL
  `

  const subs = await prisma.schoolSubscription.findMany({
    select: { schoolId: true, amount: true, cycle: true, status: true },
  })
  const subBySchool = new Map(subs.map((sub) => [sub.schoolId, sub]))

  const flagged: AtRiskSchool[] = []

  for (const row of rows) {
    const billed = Number(row.billed ?? 0)
    const collected = Number(row.collected ?? 0)
    const sub = subBySchool.get(row.id)

    const health = healthScore({
      lastActiveAt: row.last_active,
      collectionRate: billed > 0 ? Math.min(1, collected / billed) : null,
      modulesInUse: Number(row.modules_in_use),
      totalModules: TOTAL_MODULES,
      subscriptionStatus: sub?.status ?? null,
      openCriticalTickets: Number(row.critical_tickets),
    })

    const openTickets = Number(row.open_tickets)
    const daysOverdue = row.oldest_overdue
      ? Math.max(0, Math.floor((Date.now() - row.oldest_overdue.getTime()) / 86_400_000))
      : 0

    const reasons: string[] = []
    if (health < 40) reasons.push(`Health ${health}`)
    if (!row.last_active || row.last_active < fourteenDaysAgo) {
      reasons.push(row.last_active ? "No login in 14 days" : "Never signed in")
    }
    if (openTickets >= 3) reasons.push(`${openTickets} open tickets`)
    if (daysOverdue > 30) reasons.push(`Payment ${daysOverdue} days overdue`)

    if (reasons.length === 0) continue

    flagged.push({
      schoolId: row.id,
      school: row.name,
      health,
      reasons,
      lastLoginAt: row.last_active?.toISOString() ?? null,
      openTickets,
      daysOverdue,
      mrr: sub
        ? sub.cycle === "MONTHLY"
          ? Number(sub.amount)
          : sub.cycle === "TERMLY"
            ? Number(sub.amount) / 3
            : Number(sub.amount) / 12
        : 0,
    })
  }

  // Worst health first, but weight by what we would lose.
  return flagged.sort((a, b) => a.health - b.health || b.mrr - a.mrr)
}
