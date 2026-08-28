import { prisma } from "@/lib/db"

// NDPR cross-tenant access records.
//
// The generic audit log records what staff CHANGED. This records what they
// READ, which is a separate obligation: a school is entitled to know that
// EduCore staff looked at its students, even when nothing was modified.
//
// Calls are explicit, at the page that does the reading, for the same reason
// audit logging is explicit — a middleware hook records an HTTP verb, not the
// intent, and "GET /console/schools/x" does not say what was on screen.

export type AccessScope =
  | "school.overview"
  | "school.users"
  | "school.students"
  | "school.financials"
  | "school.usage"
  | "school.activity"
  | "school.support"
  | "school.impersonation"

export async function logDataAccess(input: {
  staffId: string
  schoolId: string
  scope: AccessScope
  path: string
  ipAddress: string
  durationMs?: number
}): Promise<void> {
  try {
    await prisma.dataAccessLog.create({
      data: {
        staffId: input.staffId,
        schoolId: input.schoolId,
        scope: input.scope,
        path: input.path,
        ipAddress: input.ipAddress,
        durationMs: input.durationMs ?? null,
      },
    })
  } catch (error) {
    // Never take a page down over a log write, but do not lose it silently
    // either — this one matters for compliance.
    console.error("[data-access] failed to record a cross-tenant read", error)
  }
}

export type AccessRow = {
  id: string
  at: string
  staff: string
  staffRole: string
  school: string
  schoolId: string
  scope: string
  path: string
  durationMs: number | null
  ipAddress: string
}

export async function listDataAccess(options: {
  schoolId?: string
  staffId?: string
  since?: Date
  page?: number
  limit?: number
}): Promise<{ rows: AccessRow[]; total: number; page: number; pages: number }> {
  const page = Math.max(1, options.page ?? 1)
  const limit = Math.min(200, Math.max(10, options.limit ?? 50))

  const where = {
    ...(options.schoolId ? { schoolId: options.schoolId } : {}),
    ...(options.staffId ? { staffId: options.staffId } : {}),
    ...(options.since ? { createdAt: { gte: options.since } } : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.dataAccessLog.count({ where }),
    prisma.dataAccessLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        createdAt: true,
        scope: true,
        path: true,
        durationMs: true,
        ipAddress: true,
        schoolId: true,
        staff: { select: { name: true, role: true } },
        school: { select: { name: true } },
      },
    }),
  ])

  return {
    rows: rows.map((row) => ({
      id: row.id,
      at: row.createdAt.toISOString(),
      staff: row.staff.name,
      staffRole: row.staff.role,
      school: row.school.name,
      schoolId: row.schoolId,
      scope: row.scope,
      path: row.path,
      durationMs: row.durationMs,
      ipAddress: row.ipAddress,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  }
}
