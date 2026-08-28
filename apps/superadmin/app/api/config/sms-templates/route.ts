import { NextResponse } from "next/server"

import { requireApiSession } from "@/lib/session-guard"
import { MERGE_TAGS, SMS_MULTIPART_CHARS, SMS_SEGMENT_CHARS, listTemplates } from "@/lib/templates"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  return NextResponse.json({
    templates: await listTemplates("SMS"),
    mergeTags: MERGE_TAGS,
    limits: { segment: SMS_SEGMENT_CHARS, multipart: SMS_MULTIPART_CHARS },
  })
}
