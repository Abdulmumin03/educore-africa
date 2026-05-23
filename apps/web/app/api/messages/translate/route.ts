import { NextResponse } from "next/server"
import { z } from "zod"
import { anthropic, aiConfigured, FAST_MODEL, extractText } from "@/lib/ai"
import { auth } from "@/lib/auth"

export const runtime = "nodejs"

const bodySchema = z.object({
  text: z.string().trim().min(1).max(4000),
  targetLanguage: z.string().trim().min(2).max(40).default("English"),
})

const SYSTEM_PROMPT = `You are a translator for Nigerian school messages.
Translate the given text into the target language. Preserve names, dates, numbers, and amounts verbatim. Output ONLY the translated text — no quotes, no commentary, no markdown.`

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const { text, targetLanguage } = parsed.data

  if (!aiConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Translation requires ANTHROPIC_API_KEY" },
      { status: 503 },
    )
  }

  try {
    const res = await anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Target language: ${targetLanguage}\n\nText:\n${text}` }],
    })
    const translation = extractText(res).trim()
    return NextResponse.json({ ok: true, translation, targetLanguage, model: FAST_MODEL })
  } catch (err) {
    const error = err instanceof Error ? err.message : "Translation failed"
    return NextResponse.json({ ok: false, error }, { status: 502 })
  }
}
