import { NextResponse } from "next/server"

import type { AuditTargetType } from "@/lib/audit"
import { auditActors, queryAudit } from "@/lib/audit-query"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const TARGET_TYPES = ["school", "user", "payment", "config", "ticket", "session", "system"]

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
  const targetType = params.get("targetType")

  const [result, actors] = await Promise.all([
    queryAudit({
      from: parseDate(params.get("from")),
      to: parseDate(params.get("to")),
      userId: params.get("userId") ?? undefined,
      action: params.get("action") ?? undefined,
      targetType:
        targetType && TARGET_TYPES.includes(targetType) ? (targetType as AuditTargetType) : undefined,
      search: params.get("search")?.trim() || undefined,
      page: Number(params.get("page") ?? 1) || 1,
      limit: Number(params.get("limit") ?? 50) || 50,
    }),
    auditActors(),
  ])

  return NextResponse.json({ ...result, actors })
}
