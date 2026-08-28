import { NextResponse } from "next/server"

import { npsSummary } from "@/lib/analytics"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const months = Math.min(24, Math.max(3, Number(new URL(request.url).searchParams.get("months") ?? 12)))
  return NextResponse.json(await npsSummary(months))
}
