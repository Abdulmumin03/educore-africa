import { NextResponse } from "next/server"
import type { TicketCategory, TicketPriority, TicketStatus } from "@prisma/client"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { listTickets } from "@/lib/support"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_CLIENT", "RESOLVED", "CLOSED"]
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
const CATEGORIES = ["BILLING", "TECHNICAL", "FEATURE_REQUEST", "ACCOUNT", "OTHER"]

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const params = new URL(request.url).searchParams
  const status = params.get("status")
  const priority = params.get("priority")
  const category = params.get("category")
  let assignedTo = params.get("assignedTo") ?? undefined
  // "me" is resolved server-side so the client never has to know its own id.
  if (assignedTo === "me") assignedTo = guard.user.id

  return NextResponse.json(
    await listTickets({
      status: status && STATUSES.includes(status) ? (status as TicketStatus) : "ALL",
      priority: priority && PRIORITIES.includes(priority) ? (priority as TicketPriority) : undefined,
      category: category && CATEGORIES.includes(category) ? (category as TicketCategory) : undefined,
      assignedTo,
      search: params.get("search")?.trim() || undefined,
      page: Number(params.get("page") ?? 1) || 1,
      limit: Number(params.get("limit") ?? 30) || 30,
    }),
  )
}

/** Raise a ticket on a school's behalf. */
export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const schoolId = typeof body.schoolId === "string" ? body.schoolId : ""
  const title = typeof body.title === "string" ? body.title.trim() : ""
  const description = typeof body.description === "string" ? body.description.trim() : ""
  const category = typeof body.category === "string" && CATEGORIES.includes(body.category) ? body.category : "OTHER"
  const priority = typeof body.priority === "string" && PRIORITIES.includes(body.priority) ? body.priority : "MEDIUM"

  if (!schoolId || !title) {
    return NextResponse.json({ error: "schoolId and title are required." }, { status: 400 })
  }

  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 })

  const ticket = await prisma.supportTicket.create({
    data: {
      schoolId,
      title,
      description: description || "Raised by EduCore support on the school's behalf.",
      category: category as TicketCategory,
      priority: priority as TicketPriority,
      status: "OPEN",
      assignedTo: typeof body.assignTo === "string" ? body.assignTo : guard.user.id,
    },
    select: { id: true, title: true, priority: true, status: true, assignedTo: true },
  })

  await auditLog({
    userId: guard.user.id,
    action: "support.ticket.create",
    target: auditTarget("ticket", ticket.id),
    targetType: "ticket",
    ipAddress: guard.ipAddress,
    details: { schoolId, school: school.name, title, priority, category },
  })

  return NextResponse.json({ ticket }, { status: 201 })
}
