import type { AuditTargetType } from "@/lib/audit"
import { auditActors, queryAudit } from "@/lib/audit-query"
import { AuditTable } from "../audit-table"

const TARGET_TYPES = ["school", "user", "payment", "config", "ticket", "session", "system"]

export async function TrailTab({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  const parseDate = (value: string | undefined) => {
    if (!value) return undefined
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  // An end date typed as a bare day means the whole of that day, not midnight.
  const to = parseDate(searchParams.to)
  if (to) to.setHours(23, 59, 59, 999)

  const [result, actors] = await Promise.all([
    queryAudit({
      from: parseDate(searchParams.from),
      to,
      userId: searchParams.userId,
      action: searchParams.action,
      targetType:
        searchParams.targetType && TARGET_TYPES.includes(searchParams.targetType)
          ? (searchParams.targetType as AuditTargetType)
          : undefined,
      search: searchParams.search,
      page: Number(searchParams.page ?? 1) || 1,
      limit: 50,
    }),
    auditActors(),
  ])

  return (
    <AuditTable
      rows={result.rows}
      total={result.total}
      page={result.page}
      pages={result.pages}
      actions={result.actions}
      actors={actors}
    />
  )
}
