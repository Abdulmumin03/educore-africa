import Anthropic from "@anthropic-ai/sdk"

// Model tiers for the console. Opus carries judgement work (churn risk,
// anomaly triage); Sonnet carries narrative summaries and copy.
//
// Note: apps/web still pins claude-opus-4-7 / claude-sonnet-4-6. The console
// starts on the current generation; migrate the school app separately.
export const RISK_MODEL = "claude-opus-5" as const
export const FAST_MODEL = "claude-sonnet-5" as const

const globalForAnthropic = globalThis as unknown as {
  superadminAnthropic: Anthropic | undefined
}

export const anthropic =
  globalForAnthropic.superadminAnthropic ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" })

if (process.env.NODE_ENV !== "production") globalForAnthropic.superadminAnthropic = anthropic

export function isAIConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

/**
 * Single-turn completion. Returns null when no API key is configured so every
 * caller can fall back to a heuristic instead of throwing — the console must
 * stay usable when Anthropic is unreachable.
 */
export type CompleteOptions = {
  prompt: string
  system?: string
  model?: string
  maxTokens?: number
  /** low | medium | high | xhigh | max — controls thinking depth and spend. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max"
}

/**
 * The same call as complete(), yielding text as it arrives.
 *
 * Uses the Anthropic SDK's own streaming rather than the Vercel AI SDK: the
 * console already depends on @anthropic-ai/sdk for every other model call, and
 * a second client library for one endpoint would mean two places to keep the
 * model identifiers, the effort setting and the refusal handling in step.
 *
 * Yields nothing at all when no key is configured, so the caller falls back to
 * its heuristic exactly as it does for complete().
 */
export async function* streamComplete(opts: CompleteOptions): AsyncGenerator<string> {
  if (!isAIConfigured()) return

  const stream = anthropic.messages.stream({
    model: opts.model ?? FAST_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    ...(opts.system ? { system: opts.system } : {}),
    ...(opts.effort ? { output_config: { effort: opts.effort } } : {}),
    messages: [{ role: "user", content: opts.prompt }],
  })

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text
    }
  }

  // A refusal arrives as a stop_reason on the assembled message, after the
  // deltas — by which point the caller has already shown whatever was said.
  // Throwing here lets it discard the partial rather than present it.
  const message = await stream.finalMessage()
  if (message.stop_reason === "refusal") throw new Error("The model declined to answer.")
}

export async function complete(opts: {
  prompt: string
  system?: string
  model?: string
  maxTokens?: number
  /** low | medium | high | xhigh | max — controls thinking depth and spend. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max"
}): Promise<string | null> {
  if (!isAIConfigured()) return null

  const res = await anthropic.messages.create({
    model: opts.model ?? FAST_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    ...(opts.system ? { system: opts.system } : {}),
    ...(opts.effort ? { output_config: { effort: opts.effort } } : {}),
    messages: [{ role: "user", content: opts.prompt }],
  })

  if (res.stop_reason === "refusal") return null

  return res.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim()
}
