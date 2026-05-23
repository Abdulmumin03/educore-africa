import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma, UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const VIEW_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

const querySchema = z.object({
  q: z.string().max(120).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  entityType: z.string().max(60).optional(),
  action: z.string().max(60).optional(),
  userId: z.string().cuid().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(10).max(200).default(50),
})

/**
 * GET /api/audit-log — filterable list. Admin-only.
 *
 * Search (`q`) is a substring match across action, entityType, and the
 * stringified payload. It's not real full-text — for small audit volumes
 * that's adequate. Switch to a tsvector if it ever becomes a hot path.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!VIEW_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    entityType: url.searchParams.get("entityType") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    userId: url.searchParams.get("userId") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 422 })
  const { q, from, to, entityType, action, userId, page, limit } = parsed.data

  const where: Prisma.AuditLogWhereInput = {
    schoolId: session.user.schoolId,
  }
  if (from || to) {
    where.createdAt = {}
    if (from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(`${from}T00:00:00`)
    if (to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(`${to}T23:59:59.999`)
  }
  if (entityType) where.entityType = entityType
  if (action) where.action = { contains: action, mode: "insensitive" }
  if (userId) where.userId = userId
  if (q) {
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { entityType: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
    ]
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ])

  // Distinct entity types + actions in this school's history so the UI
  // can populate filter dropdowns dynamically.
  const facets = await prisma.auditLog.findMany({
    where: { schoolId: session.user.schoolId },
    select: { entityType: true, action: true },
    distinct: ["entityType", "action"],
    take: 500,
  })
  const entityTypes = Array.from(new Set(facets.map((f) => f.entityType))).sort()
  const actions = Array.from(new Set(facets.map((f) => f.action))).sort()

  return NextResponse.json({
    total,
    page,
    limit,
    facets: { entityTypes, actions },
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      user: r.user
        ? {
            id: r.user.id,
            name: `${r.user.firstName} ${r.user.lastName}`,
            role: r.user.role,
          }
        : null,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      payload: r.payload,
    })),
  })
}
