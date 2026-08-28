import { NextResponse } from "next/server"

import { requireApiSession } from "@/lib/session-guard"
import { MERGE_TAGS, listTemplates } from "@/lib/templates"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  return NextResponse.json({
    templates: await listTemplates("EMAIL"),
    mergeTags: MERGE_TAGS,
  })
}
