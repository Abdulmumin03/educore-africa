import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

/** Fetch the full message history of a conversation (own conversations only). */
export async function GET(_req: Request, { params }: { params: { conversationId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const convo = await prisma.askConversation.findFirst({
    where: {
      id: params.conversationId,
      schoolId: session.user.schoolId,
      userId: session.user.id,
      deletedAt: null,
    },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  })
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    id: convo.id,
    title: convo.title,
    messages: convo.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls,
      createdAt: m.createdAt.toISOString(),
    })),
  })
}
