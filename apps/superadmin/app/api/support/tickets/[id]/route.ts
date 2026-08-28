import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { slaTimer } from "@/lib/support"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      priority: true,
      status: true,
      assignedTo: true,
      createdAt: true,
      firstResponseAt: true,
      resolvedAt: true,
      escalatedAt: true,
      schoolId: true,
      school: { select: { name: true, slug: true, state: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        select: { id: true, authorId: true, body: true, isInternal: true, createdAt: true },
      },
    },
  })
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })

  // Comment authors may be console staff or school users — look both up.
  const authorIds = [...new Set(ticket.comments.map((c) => c.authorId))]
  const [staff, schoolUsers, agents] = await Promise.all([
    prisma.superAdminUser.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, role: true } }),
    prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, firstName: true, lastName: true, role: true },
    }),
    prisma.superAdminUser.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ])

  const names = new Map<string, { name: string; kind: "staff" | "school" }>()
  for (const person of staff) names.set(person.id, { name: person.name, kind: "staff" })
  for (const person of schoolUsers) {
    names.set(person.id, { name: `${person.firstName} ${person.lastName}`.trim(), kind: "school" })
  }

  return NextResponse.json({
    ticket: {
      ...ticket,
      createdAt: ticket.createdAt.toISOString(),
      firstResponseAt: ticket.firstResponseAt?.toISOString() ?? null,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      escalatedAt: ticket.escalatedAt?.toISOString() ?? null,
      assignedName: ticket.assignedTo
        ? (agents.find((a) => a.id === ticket.assignedTo)?.name ?? "Unknown")
        : null,
      sla: slaTimer(ticket),
      comments: ticket.comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        isInternal: comment.isInternal,
        createdAt: comment.createdAt.toISOString(),
        author: names.get(comment.authorId)?.name ?? "Unknown",
        authorKind: names.get(comment.authorId)?.kind ?? "school",
      })),
    },
    agents,
  })
}
