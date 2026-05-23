import Anthropic from "@anthropic-ai/sdk"

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * Project AI model defaults. See [[project-p04-ai-model]] memory for context:
 * Sonnet for routine text gen, Opus for high-stakes scoring. The P08 spec
 * mentions `claude-sonnet-4-20250514`; we use the rolling Sonnet 4.6 alias
 * which points at the same family, just newer.
 */
export const DEFAULT_MODEL = "claude-opus-4-7"
export const FAST_MODEL = "claude-sonnet-4-6"
export const HEAVY_MODEL = "claude-opus-4-7"

/**
 * Extract the joined text content from an Anthropic response, ignoring
 * non-text blocks (tool_use etc). Empty string when nothing returned.
 */
export function extractText(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim()
}

/**
 * Parse a JSON payload from a model that may have wrapped it in code fences.
 * Returns `null` when parsing fails so callers can fall back gracefully.
 */
export function parseJsonResponse<T>(raw: string): T | null {
  if (!raw) return null
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    return null
  }
}

/**
 * Standard "AI not configured" guard. Returns true when ANTHROPIC_API_KEY is
 * present, false otherwise. Routes typically branch on this to fall back to
 * heuristics or return 503.
 */
export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

/**
 * Thin helper for a one-shot, JSON-returning Claude call. Keeps the
 * boilerplate (system + max_tokens + extractText + parse) out of routes.
 */
export async function generateJson<T>(opts: {
  system: string
  user: string
  model?: string
  maxTokens?: number
}): Promise<{ ok: true; data: T; raw: string; model: string } | { ok: false; error: string }> {
  if (!aiConfigured()) return { ok: false, error: "ANTHROPIC_API_KEY not configured" }
  const model = opts.model ?? FAST_MODEL
  try {
    const res = await anthropic.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    })
    const text = extractText(res)
    const data = parseJsonResponse<T>(text)
    if (data === null) return { ok: false, error: "AI returned unparseable JSON" }
    return { ok: true, data, raw: text, model }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI error" }
  }
}
