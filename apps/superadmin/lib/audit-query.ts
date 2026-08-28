import type { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import type { AuditTargetType } from "@/lib/audit"

// Reading the super-admin audit trail. Writing it lives in lib/audit.ts.

export type AuditRow = {
  id: string
  at: string
  userId: string | null
  user: string
  role: string | null
  action: string
  target: string
  targetType: string
  ipAddress: string
  details: Record<string, unknown> | null
  /** Present when the action recorded a from/to pair. */
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

export type AuditFilters = {
  from?: Date
  to?: Date
  userId?: string
  action?: string
  targetType?: AuditTargetType
  search?: string
  page?: number
  limit?: number
}

function splitBeforeAfter(details: unknown): {
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
} {
  if (!details || typeof details !== "object") return { before: null, after: null }
  const record = details as Record<string, unknown>
  const before = record.from ?? record.before
  const after = record.to ?? record.after
  return {
    before: before && typeof before === "object" ? (before as Record<string, unknown>) : null,
    after: after && typeof after === "object" ? (after as Record<string, unknown>) : null,
  }
}

export async function queryAudit(filters: AuditFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(500, Math.max(10, filters.limit ?? 50))

  const where: Prisma.SuperAdminAuditLogWhereInput = {
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.targetType ? { targetType: filters.targetType } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { action: { contains: filters.search, mode: "insensitive" } },
            { target: { contains: filters.search, mode: "insensitive" } },
            { ipAddress: { contains: filters.search } },
          ],
        }
      : {}),
  }

  const [total, rows, actions] = await Promise.all([
    prisma.superAdminAuditLog.count({ where }),
    prisma.superAdminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        createdAt: true,
        userId: true,
        action: true,
        target: true,
        targetType: true,
        ipAddress: true,
        details: true,
        user: { select: { name: true, role: true } },
      },
    }),
    // Distinct action names, for the filter dropdown. Free-form strings, so
    // the list has to come from the data rather than an enum.
    prisma.superAdminAuditLog.findMany({
      distinct: ["action"],
      orderBy: { action: "asc" },
      select: { action: true },
      take: 200,
    }),
  ])

  const list: AuditRow[] = rows.map((row) => {
    const { before, after } = splitBeforeAfter(row.details)
    return {
      id: row.id,
      at: row.createdAt.toISOString(),
      userId: row.userId,
      // A pre-auth event (a blocked IP, an unknown email) has no account.
      user: row.user?.name ?? "Unauthenticated",
      role: row.user?.role ?? null,
      action: row.action,
      target: row.target,
      targetType: row.targetType,
      ipAddress: row.ipAddress,
      details: (row.details as Record<string, unknown> | null) ?? null,
      before,
      after,
    }
  })

  return {
    rows: list,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    actions: actions.map((row) => row.action),
  }
}

export async function auditActors() {
  return prisma.superAdminUser.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  })
}
