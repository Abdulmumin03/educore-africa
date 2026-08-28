import { NextResponse } from "next/server"
import type { LeadStage } from "@prisma/client"

import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { positionFor } from "@/lib/leads"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const STAGES = ["NEW", "CONTACTED", "DEMO_SCHEDULED", "TRIAL_STARTED", "CONVERTED", "LOST"]

/**
 * Move or edit a lead.
 *
 * A drag sends the destination stage plus the ids either side of the drop, and
 * the server resolves the position — the client never invents an ordering
 * number, so two people dragging at once cannot produce a board that
 * disagrees with itself.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "SALES_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const existing = await prisma.lead.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: "Lead not found" }, { status: 404 })

  const data: Record<string, unknown> = {}

  if (typeof body.stage === "string" && STAGES.includes(body.stage)) {
    const stage = body.stage as LeadStage
    // Marking a lead lost without a reason throws away the only useful part
    // of a loss.
    if (stage === "LOST" && !(typeof body.lostReason === "string" && body.lostReason.trim())) {
      return NextResponse.json({ error: "Give a reason when marking a lead lost." }, { status: 400 })
    }
    data.stage = stage
    if (stage !== existing.stage) data.stageChangedAt = new Date()
    if (stage === "LOST") data.lostReason = (body.lostReason as string).trim()
    if (stage !== "LOST") data.lostReason = null

    data.position = await positionFor(
      stage,
      typeof body.afterId === "string" ? body.afterId : null,
      typeof body.beforeId === "string" ? body.beforeId : null,
    )
  }

  if (typeof body.schoolName === "string" && body.schoolName.trim()) data.schoolName = body.schoolName.trim()
  if (typeof body.contactName === "string" && body.contactName.trim()) data.contactName = body.contactName.trim()
  if (typeof body.contactEmail === "string") data.contactEmail = body.contactEmail.trim() || null
  if (typeof body.contactPhone === "string") data.contactPhone = body.contactPhone.trim() || null
  if (typeof body.state === "string") data.state = body.state.trim() || null
  if (typeof body.source === "string") data.source = body.source.trim() || null
  if (typeof body.notes === "string") data.notes = body.notes.trim() || null
  if (typeof body.ownerId === "string") data.ownerId = body.ownerId || null

  if (typeof body.convertedSchoolId === "string" && body.convertedSchoolId) {
    const school = await prisma.school.findFirst({
      where: { id: body.convertedSchoolId, deletedAt: null },
      select: { id: true },
    })
    if (!school) return NextResponse.json({ error: "That school does not exist." }, { status: 400 })
    data.convertedSchoolId = school.id
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 })
  }

  const lead = await prisma.lead.update({
    where: { id: existing.id },
    data,
    select: { id: true, stage: true, position: true, schoolName: true, lostReason: true },
  })

  // Only a stage change is worth an audit row; dragging within a column is
  // housekeeping, and logging it would bury the moves that matter.
  if (data.stage && data.stage !== existing.stage) {
    await auditLog({
      userId: guard.user.id,
      action: "growth.lead.stage",
      target: auditTarget("system", `lead:${existing.id}`),
      targetType: "system",
      ipAddress: guard.ipAddress,
      details: {
        schoolName: existing.schoolName,
        from: { stage: existing.stage },
        to: { stage: lead.stage },
        lostReason: lead.lostReason,
      },
    })
  }

  return NextResponse.json({ lead })
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "SALES_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  const existing = await prisma.lead.findUnique({
    where: { id: params.id },
    select: { id: true, schoolName: true, stage: true },
  })
  if (!existing) return NextResponse.json({ error: "Lead not found" }, { status: 404 })

  await prisma.lead.delete({ where: { id: existing.id } })

  await auditLog({
    userId: guard.user.id,
    action: "growth.lead.delete",
    target: auditTarget("system", `lead:${existing.id}`),
    targetType: "system",
    ipAddress: guard.ipAddress,
    details: { schoolName: existing.schoolName, stage: existing.stage },
  })

  return NextResponse.json({ ok: true })
}
