import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

/**
 * Full message thread with one other user. `conversationId` is the OTHER
 * user's id — we collapse the two-way exchange into one chronological list.
 *
 * GET also marks all messages received from that user as read in the same
 * pass, so the unread badge clears the moment a user opens a thread.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ conversationId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const { conversationId: otherId } = await ctx.params
  const me = session.user.id

  const other = await prisma.user.findFirst({
    where: { id: otherId, schoolId: session.user.schoolId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      role: true,
      email: true,
      phone: true,
    },
  })
  if (!other) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const messages = await prisma.message.findMany({
    where: {
      schoolId: session.user.schoolId,
      deletedAt: null,
      OR: [
        { senderId: me, receiverId: otherId },
        { senderId: otherId, receiverId: me },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  })

  // Mark anything received from this user as read.
  const unreadIds = messages
    .filter((m) => m.senderId === otherId && m.receiverId === me && !m.readAt)
    .map((m) => m.id)
  if (unreadIds.length > 0) {
    await prisma.message.updateMany({
      where: { id: { in: unreadIds } },
      data: { readAt: new Date() },
    })
  }

  return NextResponse.json({
    other,
    messages: messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      receiverId: m.receiverId,
      subject: m.subject,
      body: m.body,
      attachments: m.attachments ?? null,
      attachmentUrl: m.attachmentUrl,
      readAt: m.readAt ? m.readAt.toISOString() : unreadIds.includes(m.id) ? new Date().toISOString() : null,
      createdAt: m.createdAt.toISOString(),
      sentByMe: m.senderId === me,
    })),
  })
}
