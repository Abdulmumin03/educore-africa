import { NextResponse } from "next/server"

import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { listLeads, pipelineSummary, positionFor } from "@/lib/leads"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "SALES_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  const [board, summary, owners] = await Promise.all([
    listLeads(),
    pipelineSummary(),
    prisma.superAdminUser.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  return NextResponse.json({ ...board, summary, owners })
}

export async function POST(request: Request) {
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

  const schoolName = typeof body.schoolName === "string" ? body.schoolName.trim() : ""
  const contactName = typeof body.contactName === "string" ? body.contactName.trim() : ""

  if (!schoolName || !contactName) {
    return NextResponse.json({ error: "A school name and a contact name are required." }, { status: 400 })
  }

  const email = typeof body.contactEmail === "string" ? body.contactEmail.trim().toLowerCase() : ""
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 })
  }

  const lead = await prisma.lead.create({
    data: {
      schoolName,
      contactName,
      contactEmail: email || null,
      contactPhone: typeof body.contactPhone === "string" ? body.contactPhone.trim() || null : null,
      state: typeof body.state === "string" ? body.state.trim() || null : null,
      sizeEstimate:
        body.sizeEstimate === null || body.sizeEstimate === undefined || body.sizeEstimate === ""
          ? null
          : Math.max(0, Math.round(Number(body.sizeEstimate))) || null,
      source: typeof body.source === "string" ? body.source.trim() || null : null,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      ownerId: typeof body.ownerId === "string" && body.ownerId ? body.ownerId : guard.user.id,
      position: await positionFor("NEW", null, null),
    },
    select: { id: true, schoolName: true, stage: true, position: true },
  })

  await auditLog({
    userId: guard.user.id,
    action: "growth.lead.create",
    target: auditTarget("system", `lead:${lead.id}`),
    targetType: "system",
    ipAddress: guard.ipAddress,
    details: { schoolName, contactName, source: body.source ?? null },
  })

  return NextResponse.json({ lead }, { status: 201 })
}
