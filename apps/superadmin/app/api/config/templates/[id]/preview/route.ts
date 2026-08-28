import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { requireApiSession } from "@/lib/session-guard"
import { SAMPLE_VALUES, renderTemplate, smsSegments, unknownTags } from "@/lib/templates"

export const dynamic = "force-dynamic"

/**
 * Render a template with sample values.
 *
 * Takes the draft from the request body rather than reading the saved row, so
 * the preview shows what is on screen — previewing the stored version while
 * the editor holds unsaved changes would be worse than no preview.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const template = await prisma.messageTemplate.findUnique({
    where: { id: params.id },
    select: { id: true, kind: true, key: true, label: true, subject: true, body: true },
  })
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 })

  const draftBody = typeof body.body === "string" ? body.body : template.body
  const draftSubject = typeof body.subject === "string" ? body.subject : (template.subject ?? "")

  return NextResponse.json({
    kind: template.kind,
    label: template.label,
    subject: template.kind === "EMAIL" ? renderTemplate(draftSubject, SAMPLE_VALUES) : null,
    body: renderTemplate(draftBody, SAMPLE_VALUES),
    unknownTags: [...new Set(unknownTags(draftBody).concat(unknownTags(draftSubject)))],
    ...(template.kind === "SMS" ? smsSegments(renderTemplate(draftBody, SAMPLE_VALUES)) : {}),
    sampleValues: SAMPLE_VALUES,
    notice: "Rendered with sample values. Nothing was sent.",
  })
}
