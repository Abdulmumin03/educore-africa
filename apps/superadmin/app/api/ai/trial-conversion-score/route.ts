import { NextResponse } from "next/server"

import { FAST_MODEL, complete, isAIConfigured } from "@/lib/ai"
import { redis } from "@/lib/redis"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"
import { conversionScore, listTrials, scoreBand, type TrialSignals } from "@/lib/trials"

export const dynamic = "force-dynamic"

const CACHE_PREFIX = "ai:trial-advice:"
const CACHE_TTL_SECONDS = 6 * 60 * 60

export type TrialAdvice = {
  schoolId: string
  school: string
  /** The arithmetic score. Never model-produced. */
  score: number
  band: ReturnType<typeof scoreBand>
  signals: TrialSignals
  /** Which signal is dragging the score down most. */
  weakest: string
  headline: string
  nextSteps: string[]
  /** True only when Claude wrote the narrative. */
  generated: boolean
  note?: string
}

const SYSTEM = `You are a SaaS customer-success lead at EduCore Africa, which sells \
school-management software to Nigerian K-12 schools. Terms run three to a year, so \
a school evaluating in the middle of a term behaves differently from one starting \
fresh. Reply with JSON only — no prose, no code fences. Work strictly from the \
figures given; never invent a number or a fact about the school.`

function buildPrompt(input: {
  school: string
  score: number
  signals: TrialSignals
  daysRemaining: number | null
}): string {
  return `Trial school: ${input.school}
Computed conversion likelihood: ${input.score}/100 (arithmetic, not your estimate — do not restate or revise it)
Observed during the trial:
- modules with any activity: ${input.signals.modulesUsed}
- students on the roll: ${input.signals.students}
- staff accounts beyond the founding admin: ${input.signals.teamSize}
- distinct days somebody signed in: ${input.signals.activeDays} of ${input.signals.trialAge} days elapsed
- days left on the trial: ${input.daysRemaining ?? "not set"}

Return exactly:
{"headline":"one sentence on what this pattern of use suggests",
 "nextSteps":["2-3 concrete actions for the account manager, each tied to a figure above"]}`
}

function parse(text: string): { headline: string; nextSteps: string[] } | null {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start === -1 || end <= start) return null

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
    const headline = typeof parsed.headline === "string" ? parsed.headline : null
    const nextSteps = Array.isArray(parsed.nextSteps)
      ? parsed.nextSteps.filter((entry): entry is string => typeof entry === "string")
      : []
    if (!headline) return null
    return { headline, nextSteps }
  } catch {
    return null
  }
}

/** Which weighted signal is furthest from full marks. */
function weakestSignal(signals: TrialSignals): string {
  const ratios: Array<[string, number]> = [
    ["students on the roll", Math.min(1, signals.students / 150)],
    ["colleagues invited", Math.min(1, signals.teamSize / 5)],
    ["modules explored", Math.min(1, signals.modulesUsed / 4)],
    [
      "days active",
      Math.min(1, signals.activeDays / Math.max(1, Math.min(signals.trialAge, 30))),
    ],
  ]
  return ratios.sort((a, b) => a[1] - b[1])[0][0]
}

function heuristic(input: {
  schoolId: string
  school: string
  score: number
  signals: TrialSignals
}): TrialAdvice {
  const weakest = weakestSignal(input.signals)
  const band = scoreBand(input.score)

  return {
    ...input,
    band,
    weakest,
    headline: `Scored ${input.score}/100 (${band}). The weakest signal is ${weakest}.`,
    nextSteps: [`Focus the next conversation on ${weakest}.`],
    generated: false,
    note: "Anthropic is not configured, so this is a plain read of the four signals rather than an analysis.",
  }
}

/**
 * Score a trial.
 *
 * The NUMBER is arithmetic in lib/trials — reproducible, arguable, and the
 * same on every call. Claude is only asked to write the reasoning around it,
 * and the response says which half came from where. A model-guessed
 * likelihood that moved between refreshes would be worse than no score.
 */
export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "SALES_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  let body: { schoolId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const schoolId = typeof body.schoolId === "string" ? body.schoolId : ""
  if (!schoolId) return NextResponse.json({ error: "Pick a school." }, { status: 400 })

  const { trials } = await listTrials()
  const trial = trials.find((entry) => entry.schoolId === schoolId)
  if (!trial) {
    return NextResponse.json({ error: "That school is not on an active trial." }, { status: 404 })
  }

  // Recomputed here rather than trusted from the list, so the endpoint is
  // self-contained and testable on its own.
  const score = conversionScore(trial.signals)
  const base = { schoolId: trial.schoolId, school: trial.school, score, signals: trial.signals }

  if (!isAIConfigured()) return NextResponse.json(heuristic(base))

  const cacheKey = `${CACHE_PREFIX}${schoolId}:${score}`
  try {
    const cached = await redis.get(cacheKey)
    if (cached) return NextResponse.json(JSON.parse(cached) as TrialAdvice)
  } catch {
    // Fall through and ask the model.
  }

  const reply = await complete({
    prompt: buildPrompt({
      school: trial.school,
      score,
      signals: trial.signals,
      daysRemaining: trial.daysRemaining,
    }),
    system: SYSTEM,
    model: FAST_MODEL,
    effort: "low",
    maxTokens: 1500,
  })

  const parsed = reply ? parse(reply) : null
  if (!parsed) {
    return NextResponse.json({
      ...heuristic(base),
      note: "The model did not return usable JSON, so this is a plain read of the four signals.",
    })
  }

  const payload: TrialAdvice = {
    ...base,
    band: scoreBand(score),
    weakest: weakestSignal(trial.signals),
    headline: parsed.headline,
    nextSteps: parsed.nextSteps,
    generated: true,
  }

  try {
    await redis.set(cacheKey, JSON.stringify(payload), "EX", CACHE_TTL_SECONDS)
  } catch {
    // Uncached is only slower.
  }

  return NextResponse.json(payload)
}
