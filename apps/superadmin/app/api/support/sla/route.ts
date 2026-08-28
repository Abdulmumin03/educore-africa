import { NextResponse } from "next/server"

import { slaDashboard } from "@/lib/support"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const days = Math.min(90, Math.max(7, Number(new URL(request.url).searchParams.get("days") ?? 14)))
  return NextResponse.json(await slaDashboard(days))
}
