import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const attachmentSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(200),
  size: z.number().int().positive().max(10 * 1024 * 1024),
  type: z.string().max(100),
})

const sendSchema = z.object({
  receiverId: z.string().min(1),
  subject: z.string().trim().max(140).optional(),
  body: z.string().trim().min(1).max(4000),
  attachments: z.array(attachmentSchema).max(5).optional(),
})

/**
 * Conversations grouped by the other participant. For each unique other user,
 * we return the latest message and the unread count. Implemented in-memory
 * because Prisma's group-by on max(createdAt) plus join is awkward — fine for
 * normal school-scale message volumes (a few thousand rows per user).
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const url = new URL(req.url)
  const sinceParam = url.searchParams.get("since")
  const since = sinceParam ? new Date(sinceParam) : null

  const me = session.user.id
  const schoolId = session.user.schoolId

  // Pull the most recent 500 messages I'm part of. Cap is large enough for
  // typical use; pagination can come later if any user crosses it.
  const rows = await prisma.message.findMany({
    where: {
      schoolId,
      deletedAt: null,
      OR: [{ senderId: me }, { receiverId: me }],
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true } },
      receiver: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true },
      },
    },
  })

  type ConversationPreview = {
    otherUserId: string
    otherUser: {
      id: string
      firstName: string
      lastName: string
      avatarUrl: string | null
      role: string
    }
    lastMessage: string
    lastSentByMe: boolean
    lastAt: string
    unreadCount: number
  }

  const map = new Map<string, ConversationPreview>()
  for (const m of rows) {
    const other = m.senderId === me ? m.receiver : m.sender
    const existing = map.get(other.id)
    const isUnread = m.receiverId === me && !m.readAt
    if (!existing) {
      map.set(other.id, {
        otherUserId: other.id,
        otherUser: other,
        lastMessage: m.body,
        lastSentByMe: m.senderId === me,
        lastAt: m.createdAt.toISOString(),
        unreadCount: isUnread ? 1 : 0,
      })
    } else {
      // Rows ordered desc, so first encountered is latest. Only bump unread.
      if (isUnread) existing.unreadCount += 1
    }
  }

  const items = Array.from(map.values()).sort((a, b) => (b.lastAt > a.lastAt ? 1 : -1))
  const totalUnread = items.reduce((acc, c) => acc + c.unreadCount, 0)

  return NextResponse.json({
    items,
    totalUnread,
    pollAt: new Date().toISOString(),
    hasNew: since ? rows.some((r) => r.createdAt > since && r.receiverId === me) : false,
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const parsed = sendSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const { receiverId, subject, body, attachments } = parsed.data
  if (receiverId === session.user.id) {
    return NextResponse.json({ error: "Cannot message yourself" }, { status: 422 })
  }

  // Receiver must be in the same school.
  const receiver = await prisma.user.findFirst({
    where: { id: receiverId, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!receiver) return NextResponse.json({ error: "Invalid recipient" }, { status: 422 })

  const created = await prisma.message.create({
    data: {
      schoolId: session.user.schoolId,
      senderId: session.user.id,
      receiverId,
      subject: subject || null,
      body,
      attachments: attachments as Prisma.InputJsonValue | undefined,
      // Legacy single-attachment field — keep populated for the first file so
      // older surfaces still show it.
      attachmentUrl: attachments?.[0]?.url ?? null,
    },
    select: { id: true, createdAt: true },
  })

  return NextResponse.json({ ok: true, id: created.id, createdAt: created.createdAt.toISOString() }, { status: 201 })
}
