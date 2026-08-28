import { NextResponse } from "next/server"

import { growthFunnel } from "@/lib/analytics"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response
  return NextResponse.json(await growthFunnel())
}
