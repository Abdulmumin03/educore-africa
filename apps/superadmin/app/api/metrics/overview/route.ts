import { NextResponse } from "next/server"

import { getPlatformMetrics } from "@/lib/metrics"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const force = new URL(request.url).searchParams.get("refresh") === "1"
  return NextResponse.json(await getPlatformMetrics(force))
}
