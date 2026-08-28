import { NextResponse } from "next/server"

import { RISK_MODEL, complete, isAIConfigured } from "@/lib/ai"
import { redis } from "@/lib/redis"
import { cohortRetention } from "@/lib/revenue"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const CACHE_KEY = "platform:ai-retention"
const CACHE_TTL_SECONDS = 24 * 60 * 60

export type RetentionInsights = {
  headline: string
  observations: string[]
  actions: string[]
  /** Present only when the model was actually consulted. */
  generated: boolean
  note?: string
}

const SYSTEM = `You are a SaaS retention analyst for EduCore Africa, a Nigerian \
EdTech company selling school-management software to K-12 schools. Nigerian \
schools run three terms a year, so seasonality around term starts is expected. \
Reply with JSON only — no prose, no code fences. Work only from the figures \
given; never invent a number that is not in the table.`

function buildPrompt(table: string): string {
  return `Monthly signup cohorts, showing the percentage of each cohort still \
on a paying subscription at each month after signup. Month 0 is the signup \
month and is 100% by definition.

${table}

Return exactly this JSON shape:
{"headline":"one sentence naming the single most important pattern",
 "observations":["3-4 specific findings, each citing a cohort or month number"],
 "actions":["2-3 concrete retention actions this data supports"]}`
}

function parse(text: string): Omit<RetentionInsights, "generated"> | null {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start === -1 || end <= start) return null

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
    const headline = typeof parsed.headline === "string" ? parsed.headline : null
    const observations = Array.isArray(parsed.observations)
      ? parsed.observations.filter((entry): entry is string => typeof entry === "string")
      : []
    const actions = Array.isArray(parsed.actions)
      ? parsed.actions.filter((entry): entry is string => typeof entry === "string")
      : []
    if (!headline || observations.length === 0) return null
    return { headline, observations, actions }
  } catch {
    return null
  }
}

/**
 * Heuristic fallback.
 *
 * Not a pretend AI answer: it states plainly which two numbers it compared, so
 * a reader can tell it apart from a model-written narrative.
 */
function heuristic(cohorts: Awaited<ReturnType<typeof cohortRetention>>["cohorts"]): RetentionInsights {
  const mature = cohorts.filter((cohort) => (cohort.retention[3] ?? null) !== null)
  const observations: string[] = []

  if (mature.length > 0) {
    const withM3 = mature.map((cohort) => ({ label: cohort.label, value: cohort.retention[3] as number }))
    const best = withM3.reduce((a, b) => (b.value > a.value ? b : a))
    const worst = withM3.reduce((a, b) => (b.value < a.value ? b : a))
    const average = withM3.reduce((sum, entry) => sum + entry.value, 0) / withM3.length

    observations.push(`Average month-3 retention across ${withM3.length} mature cohorts is ${average.toFixed(1)}%.`)
    observations.push(`Best: ${best.label} at ${best.value.toFixed(1)}%. Weakest: ${worst.label} at ${worst.value.toFixed(1)}%.`)
  }

  const churnedEarly = cohorts.filter((cohort) => (cohort.retention[1] ?? 100) < 90)
  if (churnedEarly.length > 0) {
    observations.push(
      `${churnedEarly.length} cohort(s) lost more than a tenth of their schools inside the first month: ${churnedEarly
        .map((cohort) => cohort.label)
        .join(", ")}.`,
    )
  }

  return {
    headline:
      observations.length > 0
        ? "Computed from the cohort table — no model was consulted."
        : "Not enough mature cohorts yet to read a retention pattern.",
    observations,
    actions: [
      "Set ANTHROPIC_API_KEY to have this panel written by Claude instead of arithmetic.",
    ],
    generated: false,
    note: "Anthropic is not configured, so these lines are a direct read of the table rather than an analysis.",
  }
}

export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const { cohorts } = await cohortRetention(12)

  if (cohorts.length === 0) {
    return NextResponse.json({
      headline: "No cohorts yet.",
      observations: [],
      actions: [],
      generated: false,
      note: "No schools have signed up in the last twelve months.",
    } satisfies RetentionInsights)
  }

  if (!isAIConfigured()) return NextResponse.json(heuristic(cohorts))

  try {
    const cached = await redis.get(CACHE_KEY)
    if (cached) return NextResponse.json(JSON.parse(cached) as RetentionInsights)
  } catch {
    // Cache miss on a dead Redis is fine — fall through and ask the model.
  }

  // A compact table beats prose: fewer tokens, and the model cannot mistake
  // which number belongs to which cohort.
  const header = ["cohort", "size", ...Array.from({ length: 12 }, (_, index) => `M${index}`)].join("\t")
  const table = [
    header,
    ...cohorts.map((cohort) =>
      [
        cohort.label,
        String(cohort.size),
        ...cohort.retention.map((value) => (value === null ? "-" : `${value.toFixed(0)}%`)),
      ].join("\t"),
    ),
  ].join("\n")

  const reply = await complete({
    prompt: buildPrompt(table),
    system: SYSTEM,
    model: RISK_MODEL,
    effort: "medium",
    maxTokens: 4000,
  })

  const parsed = reply ? parse(reply) : null
  if (!parsed) {
    const fallback = heuristic(cohorts)
    return NextResponse.json({
      ...fallback,
      note: "The model did not return usable JSON, so these lines are a direct read of the table.",
    })
  }

  const payload: RetentionInsights = { ...parsed, generated: true }
  try {
    await redis.set(CACHE_KEY, JSON.stringify(payload), "EX", CACHE_TTL_SECONDS)
  } catch {
    // Uncached is only slower, not wrong.
  }

  return NextResponse.json(payload)
}
