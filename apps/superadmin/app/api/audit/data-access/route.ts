import { NextResponse } from "next/server"

import { listDataAccess } from "@/lib/data-access"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "ENGINEERING_ADMIN")
  if (forbidden) return forbidden

  const params = new URL(request.url).searchParams
  const sinceParam = params.get("since")
  const since = sinceParam ? new Date(sinceParam) : undefined

  return NextResponse.json(
    await listDataAccess({
      schoolId: params.get("schoolId") ?? undefined,
      staffId: params.get("staffId") ?? undefined,
      since: since && !Number.isNaN(since.getTime()) ? since : undefined,
      page: Number(params.get("page") ?? 1) || 1,
      limit: Number(params.get("limit") ?? 50) || 50,
    }),
  )
}
