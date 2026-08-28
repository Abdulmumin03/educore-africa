import { NextResponse } from "next/server"

import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"
import { saveTemplate, smsSegments, unknownTags } from "@/lib/templates"

export const dynamic = "force-dynamic"

/**
 * Save a template edit.
 *
 * Editing here changes what goes out NEXT time the sender looks the template
 * up. It does not resend anything, and the response says so — an operator who
 * fixes a typo in the renewal reminder should not be left wondering whether
 * they just mailed 200 schools.
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "BUSINESS_ADMIN", "ENGINEERING_ADMIN")
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const template = await prisma.messageTemplate.findUnique({
    where: { id: params.id },
    select: { id: true, kind: true, key: true, subject: true, body: true },
  })
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 })

  const nextBody = typeof body.body === "string" ? body.body : ""
  const nextSubject = typeof body.subject === "string" ? body.subject.trim() : null

  if (!nextBody.trim()) {
    return NextResponse.json({ error: "The body cannot be empty." }, { status: 400 })
  }
  if (template.kind === "EMAIL" && !(nextSubject ?? template.subject)) {
    return NextResponse.json({ error: "An email template needs a subject line." }, { status: 400 })
  }

  // A tag nobody substitutes ships to the recipient verbatim, so refuse the
  // save rather than let "{{schol_name}}" reach a school.
  const bad = unknownTags(nextBody).concat(nextSubject ? unknownTags(nextSubject) : [])
  if (bad.length > 0) {
    return NextResponse.json(
      { error: `Unknown merge tag(s): ${[...new Set(bad)].map((tag) => `{{${tag}}}`).join(", ")}` },
      { status: 400 },
    )
  }

  const saved = await saveTemplate({
    id: template.id,
    subject: nextSubject,
    body: nextBody,
    editedById: guard.user.id,
  })
  if (!saved) return NextResponse.json({ error: "Template not found" }, { status: 404 })

  await auditLog({
    userId: guard.user.id,
    action: "config.template.update",
    target: auditTarget("config", `${template.kind.toLowerCase()}:${template.key}`),
    targetType: "config",
    ipAddress: guard.ipAddress,
    details: {
      kind: template.kind,
      key: template.key,
      version: saved.version,
      subjectChanged: template.kind === "EMAIL" && nextSubject !== template.subject,
      bodyChanged: nextBody !== template.body,
    },
  })

  return NextResponse.json({
    ok: true,
    version: saved.version,
    ...(template.kind === "SMS" ? smsSegments(nextBody) : {}),
    notice: "Saved. This changes future sends only — nothing was sent now.",
  })
}
