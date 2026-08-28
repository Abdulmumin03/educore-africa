import { NextResponse } from "next/server"
import type { BroadcastAudience } from "@prisma/client"

import { previewAudience, type AudienceFilter } from "@/lib/broadcast"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const AUDIENCES = ["ALL", "BY_PLAN", "BY_STATE", "BY_STATUS", "CUSTOM"]

export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const audience =
    typeof body.audience === "string" && AUDIENCES.includes(body.audience)
      ? (body.audience as BroadcastAudience)
      : "ALL"

  return NextResponse.json(
    await previewAudience(audience, (body.filter ?? {}) as AudienceFilter),
  )
}
