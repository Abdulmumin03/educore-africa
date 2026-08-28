import { NextResponse } from "next/server"

import { PLANS, resolveRange, revenueByPeriod } from "@/lib/revenue"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const params = new URL(request.url).searchParams
  const granularity = params.get("granularity") === "weekly" ? "weekly" : "monthly"
  const range = resolveRange(
    params.get("preset") ?? (params.get("from") ? "custom" : "12m"),
    params.get("from") ?? undefined,
    params.get("to") ?? undefined,
  )

  return NextResponse.json({
    points: await revenueByPeriod(range, granularity),
    plans: PLANS,
    granularity,
  })
}
