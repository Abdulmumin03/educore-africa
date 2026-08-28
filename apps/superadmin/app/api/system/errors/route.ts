import { NextResponse } from "next/server"

import { errorLog } from "@/lib/api-errors"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "ENGINEERING_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  const params = new URL(request.url).searchParams
  const sinceParam = params.get("since")
  const since = sinceParam ? new Date(sinceParam) : undefined

  return NextResponse.json(
    await errorLog({
      since: since && !Number.isNaN(since.getTime()) ? since : undefined,
      endpoint: params.get("endpoint") ?? undefined,
      minStatus: Number(params.get("minStatus") ?? 400) || 400,
      limit: Number(params.get("limit") ?? 100) || 100,
    }),
  )
}
