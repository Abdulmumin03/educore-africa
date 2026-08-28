import { NextResponse } from "next/server"

import { getAlerts } from "@/lib/alerts"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const alerts = await getAlerts()
  return NextResponse.json({
    alerts,
    criticalCount: alerts.filter((alert) => alert.severity === "critical").length,
  })
}
