import { NextResponse } from "next/server"
import type { DataRequestStatus } from "@prisma/client"

import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const STATUSES = ["RECEIVED", "IN_PROGRESS", "COMPLETED", "DENIED"]

/** Record what was done about a request and close it. */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "ENGINEERING_ADMIN", "SUPPORT_ADMIN")
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const existing = await prisma.dataSubjectRequest.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, type: true, dueAt: true },
  })
  if (!existing) return NextResponse.json({ error: "Request not found" }, { status: 404 })

  const status =
    typeof body.status === "string" && STATUSES.includes(body.status)
      ? (body.status as DataRequestStatus)
      : null
  const resolution = typeof body.resolution === "string" ? body.resolution.trim() : ""

  if (!status) return NextResponse.json({ error: "Pick a status." }, { status: 400 })

  // Closing a request without saying what was done leaves nothing to show a
  // regulator, which is the entire point of the record.
  if ((status === "COMPLETED" || status === "DENIED") && !resolution) {
    return NextResponse.json(
      { error: "Describe the action taken before closing the request." },
      { status: 400 },
    )
  }

  const settled = status === "COMPLETED" || status === "DENIED"

  const updated = await prisma.dataSubjectRequest.update({
    where: { id: existing.id },
    data: {
      status,
      resolution: resolution || undefined,
      handledById: guard.user.id,
      // Reopening clears the completion stamp so the clock is honest again.
      completedAt: settled ? new Date() : null,
      ...(typeof body.userId === "string" && body.userId ? { userId: body.userId } : {}),
    },
    select: { id: true, status: true, completedAt: true, resolution: true, userId: true },
  })

  await auditLog({
    userId: guard.user.id,
    action: "compliance.request.update",
    target: auditTarget("system", `dsr:${existing.id}`),
    targetType: "system",
    ipAddress: guard.ipAddress,
    details: {
      from: { status: existing.status },
      to: { status: updated.status },
      withinWindow: settled ? new Date() <= existing.dueAt : null,
    },
  })

  return NextResponse.json({ request: updated })
}
