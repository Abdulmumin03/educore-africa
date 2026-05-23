import { NextResponse } from "next/server"
import { z } from "zod"
import type Anthropic from "@anthropic-ai/sdk"
import { anthropic, aiConfigured, FAST_MODEL } from "@/lib/ai"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { ASK_TOOLS, ASK_SYSTEM_PROMPT, runAskTool } from "@/lib/ai/ask-tools"

export const runtime = "nodejs"
export const maxDuration = 60

const inputSchema = z.object({
  conversationId: z.string().cuid().optional(),
  question: z.string().trim().min(1).max(2000),
})

const MAX_TOOL_ITERATIONS = 5
const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "COUNSELOR", "BURSAR"]

type RecordedToolCall = {
  name: string
  input: Record<string, unknown>
  result: Record<string, unknown>
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!VIEW_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!aiConfigured())
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 })

  const parsed = inputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 })

  // Resolve / create conversation.
  let conversationId = parsed.data.conversationId
  if (conversationId) {
    const existing = await prisma.askConversation.findFirst({
      where: {
        id: conversationId,
        schoolId: session.user.schoolId,
        userId: session.user.id,
        deletedAt: null,
      },
      select: { id: true },
    })
    if (!existing) conversationId = undefined
  }
  if (!conversationId) {
    const created = await prisma.askConversation.create({
      data: {
        schoolId: session.user.schoolId,
        userId: session.user.id,
        title: parsed.data.question.slice(0, 80),
      },
      select: { id: true },
    })
    conversationId = created.id
  }

  // Load prior messages as Anthropic conversation history.
  const prior = await prisma.askMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 30,
  })
  const messages: Anthropic.Messages.MessageParam[] = prior.map((m) => ({
    role: m.role === "USER" ? "user" : "assistant",
    content: m.content,
  }))
  messages.push({ role: "user", content: parsed.data.question })

  // Persist the user turn now (so even if AI errors out we have history).
  await prisma.askMessage.create({
    data: {
      conversationId,
      role: "USER",
      content: parsed.data.question,
    },
  })

  // Tool-use loop.
  const recordedTools: RecordedToolCall[] = []
  let finalText = ""
  let iteration = 0
  let lastResponse: Anthropic.Messages.Message | null = null

  while (iteration < MAX_TOOL_ITERATIONS) {
    iteration += 1
    const response = await anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 1200,
      system: ASK_SYSTEM_PROMPT,
      tools: ASK_TOOLS,
      messages,
    })
    lastResponse = response

    // Capture any text the model emitted alongside tool calls.
    for (const block of response.content) {
      if (block.type === "text") finalText = block.text.trim()
    }

    if (response.stop_reason !== "tool_use") break

    // Add assistant turn (with tool_use blocks) to history.
    messages.push({ role: "assistant", content: response.content })

    const toolUseBlocks = response.content.filter(
      (b): b is Extract<typeof b, { type: "tool_use" }> => b.type === "tool_use",
    )
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []
    for (const call of toolUseBlocks) {
      const result = await runAskTool(
        session.user.schoolId,
        call.name,
        call.input as Record<string, unknown>,
      )
      recordedTools.push({
        name: call.name,
        input: (call.input ?? {}) as Record<string, unknown>,
        result,
      })
      toolResults.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: JSON.stringify(result).slice(0, 50_000),
      })
    }
    messages.push({ role: "user", content: toolResults })
  }

  if (!finalText) {
    finalText =
      lastResponse?.stop_reason === "max_tokens"
        ? "Sorry, I ran out of room to finish. Try a more specific question."
        : "I couldn't find a tool that fits that question. Try rephrasing — e.g. mention a class, term, or subject."
  }

  await prisma.askMessage.create({
    data: {
      conversationId,
      role: "ASSISTANT",
      content: finalText,
      toolCalls:
        recordedTools.length > 0
          ? (recordedTools as unknown as import("@prisma/client").Prisma.InputJsonValue)
          : undefined,
      model: FAST_MODEL,
    },
  })
  await prisma.askConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  })

  return NextResponse.json({
    conversationId,
    message: finalText,
    toolCalls: recordedTools,
    model: FAST_MODEL,
  })
}

/** GET — most recent conversations for the signed-in user. */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const conversations = await prisma.askConversation.findMany({
    where: {
      schoolId: session.user.schoolId,
      userId: session.user.id,
      deletedAt: null,
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, title: true, updatedAt: true },
  })
  return NextResponse.json({ items: conversations })
}
