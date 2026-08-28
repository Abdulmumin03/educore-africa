import { NextResponse } from "next/server"

import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"
import { saveTemplate } from "@/lib/templates"

export const dynamic = "force-dynamic"

/**
 * Restore an earlier version.
 *
 * A rollback is itself an edit: it snapshots the current wording before
 * restoring, so rolling back a rollback works and the history stays a
 * complete record rather than a stack that loses its top.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "BUSINESS_ADMIN", "ENGINEERING_ADMIN")
  if (forbidden) return forbidden

  let body: { version?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const version = Number(body.version)
  if (!Number.isInteger(version) || version < 1) {
    return NextResponse.json({ error: "Pick a version to restore." }, { status: 400 })
  }

  const template = await prisma.messageTemplate.findUnique({
    where: { id: params.id },
    select: { id: true, kind: true, key: true },
  })
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 })

  const snapshot = await prisma.messageTemplateVersion.findUnique({
    where: { templateId_version: { templateId: template.id, version } },
    select: { subject: true, body: true, version: true },
  })
  if (!snapshot) return NextResponse.json({ error: "That version does not exist." }, { status: 404 })

  const saved = await saveTemplate({
    id: template.id,
    subject: snapshot.subject,
    body: snapshot.body,
    editedById: guard.user.id,
  })

  await auditLog({
    userId: guard.user.id,
    action: "config.template.rollback",
    target: auditTarget("config", `${template.kind.toLowerCase()}:${template.key}`),
    targetType: "config",
    ipAddress: guard.ipAddress,
    details: { restoredVersion: version, newVersion: saved?.version },
  })

  return NextResponse.json({
    ok: true,
    restoredVersion: version,
    newVersion: saved?.version,
    notice: `Version ${version} is live again. The wording it replaced was kept as version ${saved?.version}.`,
  })
}
