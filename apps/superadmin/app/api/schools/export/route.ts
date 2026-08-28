import type { SchoolPlan, SubscriptionStatus } from "@prisma/client"

import { csvResponse, type Row } from "@/lib/exports"
import { auditLog } from "@/lib/audit"
import { listSchools } from "@/lib/schools"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const MAX_ROWS = 5000

/** CSV of the current directory filters — same query, no page limit. */
export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const params = new URL(request.url).searchParams
  const { rows, total } = await listSchools({
    page: 1,
    limit: MAX_ROWS,
    search: params.get("search")?.trim() || undefined,
    state: params.get("state")?.trim() || undefined,
    plan: (params.get("plan") as SchoolPlan) || undefined,
    status: (params.get("status") as SubscriptionStatus) || undefined,
    from: params.get("from") ? new Date(params.get("from")!) : undefined,
    to: params.get("to") ? new Date(params.get("to")!) : undefined,
  })

  await auditLog({
    userId: guard.user.id,
    action: "school.export",
    target: "schools",
    targetType: "school",
    ipAddress: guard.ipAddress,
    details: { rows: rows.length, matched: total, filters: Object.fromEntries(params) },
  })

  const csv: Row[] = rows.map((row) => ({
    Name: row.name,
    Slug: row.slug,
    State: row.state ?? "",
    Country: row.country,
    Email: row.email ?? "",
    Plan: row.plan ?? "",
    Status: row.status ?? "",
    Students: row.students,
    Staff: row.staff,
    "MRR (NGN)": Math.round(row.mrr),
    "Health score": row.health,
    "Last active": row.lastActiveAt ?? "",
    Registered: row.createdAt.slice(0, 10),
  }))

  const stamp = new Date().toISOString().slice(0, 10)
  return csvResponse(csv, `educore-schools-${stamp}`)
}
