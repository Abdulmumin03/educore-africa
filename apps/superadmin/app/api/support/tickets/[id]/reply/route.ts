import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

/**
 * Post a reply or an internal note.
 *
 * A public reply also stamps firstResponseAt if this is the first one — that
 * timestamp is what the SLA clock switches on, so it has to be set here
 * rather than inferred later.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  let body: { body?: unknown; isInternal?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const text = typeof body.body === "string" ? body.body.trim() : ""
  const isInternal = body.isInternal === true

  if (!text) return NextResponse.json({ error: "A reply cannot be empty." }, { status: 400 })
  if (text.length > 8000) {
    return NextResponse.json({ error: "Replies are limited to 8000 characters." }, { status: 400 })
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: params.id },
    select: { id: true, schoolId: true, status: true, firstResponseAt: true },
  })
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })

  const now = new Date()
  const isFirstPublicReply = !isInternal && ticket.firstResponseAt === null

  const [comment] = await prisma.$transaction([
    prisma.ticketComment.create({
      data: { ticketId: ticket.id, authorId: guard.user.id, body: text, isInternal },
      select: { id: true, body: true, isInternal: true, createdAt: true },
    }),
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        ...(isFirstPublicReply ? { firstResponseAt: now } : {}),
        // A public reply on a fresh ticket means someone is now working it.
        ...(!isInternal && ticket.status === "OPEN" ? { status: "IN_PROGRESS" as const } : {}),
      },
    }),
  ])

  await auditLog({
    userId: guard.user.id,
    action: isInternal ? "support.note.add" : "support.ticket.reply",
    target: auditTarget("ticket", ticket.id),
    targetType: "ticket",
    ipAddress: guard.ipAddress,
    details: { length: text.length, isInternal, firstResponse: isFirstPublicReply },
  })

  return NextResponse.json(
    {
      comment: {
        ...comment,
        createdAt: comment.createdAt.toISOString(),
        author: guard.user.name,
        authorKind: "staff",
      },
      firstResponseAt: isFirstPublicReply ? now.toISOString() : ticket.firstResponseAt?.toISOString() ?? null,
    },
    { status: 201 },
  )
}
