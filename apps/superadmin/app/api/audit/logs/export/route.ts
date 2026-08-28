import type { AuditTargetType } from "@/lib/audit"
import { auditLog, auditTarget } from "@/lib/audit"
import { auditPdfResponse } from "@/lib/audit-pdf"
import { queryAudit } from "@/lib/audit-query"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const TARGET_TYPES = ["school", "user", "payment", "config", "ticket", "session", "system"]
/** A compliance export is a document, not a data dump. */
const MAX_ROWS = 2000

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "ENGINEERING_ADMIN")
  if (forbidden) return forbidden

  const params = new URL(request.url).searchParams
  const parseDate = (value: string | null) => {
    if (!value) return undefined
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  const from = parseDate(params.get("from"))
  const to = parseDate(params.get("to"))
  const userId = params.get("userId") ?? undefined
  const action = params.get("action") ?? undefined
  const targetTypeParam = params.get("targetType")
  const targetType =
    targetTypeParam && TARGET_TYPES.includes(targetTypeParam)
      ? (targetTypeParam as AuditTargetType)
      : undefined

  const result = await queryAudit({
    from,
    to,
    userId,
    action,
    targetType,
    search: params.get("search")?.trim() || undefined,
    page: 1,
    limit: MAX_ROWS,
  })

  const filters: string[] = []
  if (userId) filters.push(`user=${result.rows.find((row) => row.userId === userId)?.user ?? userId}`)
  if (action) filters.push(`action=${action}`)
  if (targetType) filters.push(`target type=${targetType}`)
  if (params.get("search")) filters.push(`search=${params.get("search")}`)
  if (result.total > MAX_ROWS) {
    // Never let a truncated export pass as complete.
    filters.push(`TRUNCATED: showing the newest ${MAX_ROWS} of ${result.total} matching rows`)
  }

  // The export is itself an auditable act — somebody took a copy of the trail.
  await auditLog({
    userId: guard.user.id,
    action: "audit.export",
    target: auditTarget("system", "audit-trail"),
    targetType: "system",
    ipAddress: guard.ipAddress,
    details: { rows: result.rows.length, matching: result.total, filters },
  })

  return auditPdfResponse(result.rows, {
    exportedBy: guard.user.name,
    exportedByRole: guard.user.role,
    exportedAt: new Date(),
    from: from ?? null,
    to: to ?? null,
    filters,
    totalMatching: result.total,
  })
}
