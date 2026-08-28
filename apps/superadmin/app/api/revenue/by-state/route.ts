import { NextResponse } from "next/server"

import { revenueByState } from "@/lib/revenue"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 10) || 10
  return NextResponse.json(await revenueByState(limit))
}
