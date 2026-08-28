import { NextResponse } from "next/server"

import { requireApiRole, requireApiSession } from "@/lib/session-guard"
import { serviceStatus } from "@/lib/services"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "ENGINEERING_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  // `force` re-probes even inside the interval — for the manual refresh
  // button, not the poller.
  const force = new URL(request.url).searchParams.get("force") === "1"
  return NextResponse.json(await serviceStatus(force))
}
