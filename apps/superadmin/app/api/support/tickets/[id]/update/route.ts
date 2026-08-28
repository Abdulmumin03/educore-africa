import { NextResponse } from "next/server"
import type { TicketCategory, TicketPriority, TicketStatus } from "@prisma/client"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_CLIENT", "RESOLVED", "CLOSED"]
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
const CATEGORIES = ["BILLING", "TECHNICAL", "FEATURE_REQUEST", "ACCOUNT", "OTHER"]

/** Assign, re-prioritise, change status, or escalate. */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const existing = await prisma.supportTicket.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      priority: true,
      category: true,
      assignedTo: true,
      schoolId: true,
      resolvedAt: true,
    },
  })
  if (!existing) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })

  const data: Record<string, unknown> = {}

  if (typeof body.assignedTo === "string" || body.assignedTo === null) {
    const assignee = body.assignedTo as string | null
    if (assignee) {
      const agent = await prisma.superAdminUser.findFirst({
        where: { id: assignee, isActive: true },
        select: { id: true },
      })
      if (!agent) return NextResponse.json({ error: "That agent does not exist." }, { status: 400 })
    }
    data.assignedTo = assignee
  }

  if (typeof body.priority === "string" && PRIORITIES.includes(body.priority)) {
    data.priority = body.priority as TicketPriority
  }

  if (typeof body.category === "string" && CATEGORIES.includes(body.category)) {
    data.category = body.category as TicketCategory
  }

  if (typeof body.status === "string" && STATUSES.includes(body.status)) {
    const next = body.status as TicketStatus
    data.status = next
    // Resolution time is measured from this stamp, so set and clear it with
    // the status rather than leaving a stale one behind on reopen.
    if (next === "RESOLVED" || next === "CLOSED") {
      data.resolvedAt = existing.resolvedAt ?? new Date()
    } else {
      data.resolvedAt = null
    }
  }

  if (body.escalate === true) data.escalatedAt = new Date()

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 })
  }

  const ticket = await prisma.supportTicket.update({
    where: { id: existing.id },
    data,
    select: {
      id: true,
      status: true,
      priority: true,
      category: true,
      assignedTo: true,
      resolvedAt: true,
      escalatedAt: true,
    },
  })

  await auditLog({
    userId: guard.user.id,
    action: body.escalate === true ? "support.ticket.escalate" : "support.ticket.update",
    target: auditTarget("ticket", existing.id),
    targetType: "ticket",
    ipAddress: guard.ipAddress,
    details: {
      from: {
        status: existing.status,
        priority: existing.priority,
        category: existing.category,
        assignedTo: existing.assignedTo,
      },
      to: {
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        assignedTo: ticket.assignedTo,
      },
    },
  })

  return NextResponse.json({ ticket })
}
