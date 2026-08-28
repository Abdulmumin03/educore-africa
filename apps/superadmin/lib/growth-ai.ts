import { randomUUID } from "node:crypto"
import type { TicketCategory, TicketPriority } from "@prisma/client"

import { RISK_MODEL, FAST_MODEL, complete, isAIConfigured } from "@/lib/ai"
import { featureAdoptionMatrix, growthFunnel, geographicBreakdown } from "@/lib/analytics"
import { prisma } from "@/lib/db"
import { getPlatformMetrics } from "@/lib/metrics"
import { pipelineSummary } from "@/lib/leads"
import { listTrials } from "@/lib/trials"

// Two platform-level AI features that did not fit anywhere else:
//   · the weekly growth recommendations on the Command Centre
//   · the auto-categoriser that runs when a ticket arrives
//
// Both follow the house rule: everything the model is shown is a real figure
// from this database, and where the model cannot be reached the fallback says
// so rather than dressing arithmetic up as analysis.

// ═══════════════════════════════════════════════════════════════════
// Growth recommendations
// ═══════════════════════════════════════════════════════════════════

export type Recommendation = {
  rank: number
  title: string
  rationale: string
  action: string
  impact: string
  effort: string
  basedOn: string[]
  generated: boolean
}

const GROWTH_SYSTEM = `You are the head of growth at EduCore Africa, a Nigerian \
EdTech company selling school-management software to K-12 schools. Nigerian \
schools run three terms a year and buy around term boundaries. Your reader is \
a five-person team that can act on maybe two of these this week, so rank them \
and be specific. Reply with JSON only — no prose, no code fences. Every claim \
must trace to a figure below; never invent one.`

/** The platform's own numbers, gathered once and shown to the model verbatim. */
async function gatherPlatformFacts() {
  const [metrics, adoption, funnel, geo, pipeline, trials, churn, pastDue] = await Promise.all([
    getPlatformMetrics(),
    featureAdoptionMatrix(),
    growthFunnel(),
    geographicBreakdown(),
    pipelineSummary(),
    listTrials(),
    // The most recent churn batch, if one has been run. Absent is absent —
    // it is reported as null rather than as "no schools at risk".
    prisma.churnRiskScore.findMany({
      where: { isLatest: true, level: { in: ["HIGH", "CRITICAL"] } },
      select: { score: true, signals: true },
    }),
    prisma.schoolSubscription.count({ where: { status: "PAST_DUE" } }),
  ])

  const built = adoption.rows.filter((row) => row.built)
  const weakest = [...built].sort((a, b) => a.overall.percent - b.overall.percent).slice(0, 3)
  const strongest = [...built].sort((a, b) => b.overall.percent - a.overall.percent).slice(0, 2)
  const measurable = funnel.stages.filter((stage) => stage.measurable)
  const worstStage = measurable
    .slice(1)
    .reduce<(typeof measurable)[number] | null>(
      (acc, stage) => (acc === null || stage.dropOff > acc.dropOff ? stage : acc),
      null,
    )

  return {
    schools: metrics.activeSchools,
    mrr: Math.round(metrics.mrr),
    trials: trials.trials.length,
    hotTrials: trials.trials.filter((trial) => trial.band === "hot").length,
    trialsEndingThisWeek: trials.trials.filter(
      (trial) => trial.daysRemaining !== null && trial.daysRemaining >= 0 && trial.daysRemaining <= 7,
    ).length,
    pipelineOpen: pipeline.total - pipeline.settled,
    winRate: pipeline.winRate === null ? null : Number(pipeline.winRate.toFixed(1)),
    biggestFunnelDropOff: worstStage
      ? { stage: worstStage.label, lostPercent: Number(worstStage.dropOff.toFixed(1)), lost: worstStage.lost }
      : null,
    weakestModules: weakest.map((row) => ({ module: row.label, adoption: Math.round(row.overall.percent) })),
    strongestModules: strongest.map((row) => ({ module: row.label, adoption: Math.round(row.overall.percent) })),
    topStates: geo.rows.slice(0, 5).map((row) => ({ state: row.state, schools: row.schools, mrr: Math.round(row.mrr) })),
    statesCovered: geo.rows.filter((row) => row.schools > 0).length,
    expansionCandidates: geo.opportunity.slice(0, 4).map((row) => row.state),
    schoolsAtRisk: churn.length,
    mrrAtRisk: Math.round(
      churn.reduce((sum, row) => sum + Number((row.signals as { mrr?: number }).mrr ?? 0), 0),
    ),
    pastDueSchools: pastDue,
  }
}

function parseRecommendations(text: string): Recommendation[] {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start === -1 || end <= start) return []

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      recommendations?: Array<Record<string, unknown>>
    }
    return (parsed.recommendations ?? [])
      .map((entry, index) => {
        const title = typeof entry.title === "string" ? entry.title : null
        const rationale = typeof entry.rationale === "string" ? entry.rationale : null
        const action = typeof entry.action === "string" ? entry.action : null
        if (!title || !rationale || !action) return null
        const norm = (value: unknown) =>
          typeof value === "string" && ["LOW", "MEDIUM", "HIGH"].includes(value.toUpperCase())
            ? value.toUpperCase()
            : "MEDIUM"
        return {
          rank: index + 1,
          title,
          rationale,
          action,
          impact: norm(entry.impact),
          effort: norm(entry.effort),
          basedOn: Array.isArray(entry.basedOn)
            ? entry.basedOn.filter((value): value is string => typeof value === "string")
            : [],
          generated: true,
        }
      })
      .filter((entry): entry is Recommendation => entry !== null)
      .slice(0, 5)
  } catch {
    return []
  }
}

/**
 * Fallback when Anthropic is unreachable.
 *
 * Not a pretend AI answer: each line names the figure it came from, so the
 * reader can tell arithmetic from analysis at a glance.
 */
function heuristicRecommendations(
  facts: Awaited<ReturnType<typeof gatherPlatformFacts>>,
): Recommendation[] {
  const out: Recommendation[] = []

  if (facts.trialsEndingThisWeek > 0) {
    out.push({
      rank: out.length + 1,
      title: `Work the ${facts.trialsEndingThisWeek} trials ending this week`,
      rationale: `${facts.trialsEndingThisWeek} of ${facts.trials} open trials pass their end date within seven days.`,
      action: "Call each one before it lapses; extend where there is genuine engagement.",
      impact: "HIGH",
      effort: "LOW",
      basedOn: ["trials"],
      generated: false,
    })
  }

  const weakest = facts.weakestModules[0]
  if (weakest) {
    out.push({
      rank: out.length + 1,
      title: `Drive adoption of ${weakest.module}`,
      rationale: `${weakest.module} sits at ${weakest.adoption}% across schools that are paying for it.`,
      action: "Add an in-app prompt on the dashboards of schools whose plan includes it but who have never opened it.",
      impact: "MEDIUM",
      effort: "MEDIUM",
      basedOn: ["feature adoption"],
      generated: false,
    })
  }

  if (facts.biggestFunnelDropOff) {
    out.push({
      rank: out.length + 1,
      title: `Fix the drop at "${facts.biggestFunnelDropOff.stage}"`,
      rationale: `${facts.biggestFunnelDropOff.lost} schools are lost at this step — ${facts.biggestFunnelDropOff.lostPercent}% of the ones that reached it.`,
      action: "Watch three schools through this step and find where they stall.",
      impact: "HIGH",
      effort: "MEDIUM",
      basedOn: ["growth funnel"],
      generated: false,
    })
  }

  if (facts.expansionCandidates.length > 0) {
    out.push({
      rank: out.length + 1,
      title: `Concentrate outbound on ${facts.expansionCandidates.slice(0, 2).join(" and ")}`,
      rationale: `These states have schools on the platform but low penetration relative to their neighbours. ${facts.statesCovered} of 37 states are covered at all.`,
      action: "Ask the schools already there for introductions before cold outreach.",
      impact: "MEDIUM",
      effort: "HIGH",
      basedOn: ["geographic"],
      generated: false,
    })
  }

  if (facts.winRate !== null && facts.winRate < 50) {
    out.push({
      rank: out.length + 1,
      title: "Look at why settled leads are being lost",
      rationale: `The pipeline converts ${facts.winRate}% of settled leads, with ${facts.pipelineOpen} still open.`,
      action: "Read the lost reasons on the last twenty and group them.",
      impact: "MEDIUM",
      effort: "LOW",
      basedOn: ["pipeline"],
      generated: false,
    })
  }

  if (facts.schoolsAtRisk > 0) {
    out.push({
      rank: out.length + 1,
      title: `Reach the ${facts.schoolsAtRisk} schools scored HIGH or CRITICAL for churn`,
      rationale: `They carry ${new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(facts.mrrAtRisk)} of monthly revenue between them.`,
      action: "Take the worst ten by score and call them this week, starting with the ones that have stopped signing in.",
      impact: "HIGH",
      effort: "MEDIUM",
      basedOn: ["churn risk"],
      generated: false,
    })
  }

  if (facts.pastDueSchools > 0) {
    out.push({
      rank: out.length + 1,
      title: `Collect from the ${facts.pastDueSchools} past-due schools`,
      rationale: `${facts.pastDueSchools} subscriptions are past due — revenue already earned and not yet banked.`,
      action: "Send the dunning sequence, then call anything still unpaid after 48 hours.",
      impact: "HIGH",
      effort: "LOW",
      basedOn: ["subscriptions"],
      generated: false,
    })
  }

  const strongest = facts.strongestModules[0]
  if (strongest) {
    out.push({
      rank: out.length + 1,
      title: `Build the sales case around ${strongest.module}`,
      rationale: `${strongest.module} is the most-adopted module at ${strongest.adoption}% — it is what schools actually stay for.`,
      action: "Write up two schools using it heavily and put them in front of the current pipeline.",
      impact: "MEDIUM",
      effort: "LOW",
      basedOn: ["feature adoption"],
      generated: false,
    })
  }

  // Ranks are assigned as candidates qualify, so a gap here would be visible
  // in the UI. Re-number after the final cut.
  return out.slice(0, 5).map((entry, index) => ({ ...entry, rank: index + 1 }))
}

export type GrowthBatch = {
  batchId: string
  recommendations: Recommendation[]
  generatedAt: string
  generated: boolean
  note?: string
}

export async function runGrowthRecommendations(): Promise<GrowthBatch> {
  const facts = await gatherPlatformFacts()
  const batchId = randomUUID()

  let recommendations: Recommendation[] = []
  let note: string | undefined

  if (isAIConfigured()) {
    const reply = await complete({
      prompt: `EduCore Africa, this week:

${JSON.stringify(facts, null, 2)}

Give exactly five growth initiatives, most valuable first. Each must cite a figure above.

Return exactly:
{"recommendations":[{"title":"…","rationale":"why, citing a figure","action":"what to do this week","impact":"LOW|MEDIUM|HIGH","effort":"LOW|MEDIUM|HIGH","basedOn":["which metrics"]}]}`,
      system: GROWTH_SYSTEM,
      model: RISK_MODEL,
      effort: "medium",
      maxTokens: 6000,
    })
    recommendations = reply ? parseRecommendations(reply) : []
    if (recommendations.length === 0) {
      note = "The model did not return usable JSON, so these are computed directly from the figures."
    }
  } else {
    note = "Anthropic is not configured, so these are computed directly from the figures rather than analysed."
  }

  if (recommendations.length === 0) recommendations = heuristicRecommendations(facts)

  if (recommendations.length > 0) {
    await prisma.growthRecommendation.createMany({
      data: recommendations.map((entry) => ({ ...entry, batchId })),
    })
  }

  return {
    batchId,
    recommendations,
    generatedAt: new Date().toISOString(),
    generated: recommendations.some((entry) => entry.generated),
    note,
  }
}

/** The most recent batch, for the Command Centre panel. */
export async function latestGrowthBatch(): Promise<GrowthBatch | null> {
  const newest = await prisma.growthRecommendation.findFirst({
    orderBy: { generatedAt: "desc" },
    select: { batchId: true, generatedAt: true },
  })
  if (!newest) return null

  const rows = await prisma.growthRecommendation.findMany({
    where: { batchId: newest.batchId },
    orderBy: { rank: "asc" },
  })

  return {
    batchId: newest.batchId,
    generatedAt: newest.generatedAt.toISOString(),
    generated: rows.some((row) => row.generated),
    recommendations: rows.map((row) => ({
      rank: row.rank,
      title: row.title,
      rationale: row.rationale,
      action: row.action,
      impact: row.impact,
      effort: row.effort,
      basedOn: row.basedOn,
      generated: row.generated,
    })),
  }
}

// ═══════════════════════════════════════════════════════════════════
// Ticket auto-categoriser
// ═══════════════════════════════════════════════════════════════════

export type Categorisation = {
  category: TicketCategory
  priority: TicketPriority
  /** A draft opening reply, never sent automatically. */
  suggestedReply: string
  confidence: "high" | "medium" | "low"
  generated: boolean
  note?: string
}

const CATEGORIES: TicketCategory[] = ["BILLING", "TECHNICAL", "FEATURE_REQUEST", "ACCOUNT", "OTHER"]
const PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

const TICKET_SYSTEM = `You triage support tickets for EduCore Africa, which sells \
school-management software to Nigerian K-12 schools. Priority reflects blast \
radius and deadline pressure, not tone: a whole year group unable to sit an \
exam is CRITICAL however politely it is reported, and an angry request for a \
new feature is not. Reply with JSON only — no prose, no code fences.`

// Keyword triage, used when Anthropic is unreachable. Ordered so the most
// specific signal wins; deliberately conservative on priority, because a
// wrongly-CRITICAL ticket burns the SLA board's credibility.
const RULES: Array<{ category: TicketCategory; priority: TicketPriority; words: string[] }> = [
  { category: "BILLING", priority: "HIGH", words: ["invoice", "payment", "paystack", "flutterwave", "refund", "charge", "billing", "subscription"] },
  { category: "ACCOUNT", priority: "HIGH", words: ["password", "log in", "login", "locked", "access", "permission", "cannot see", "role"] },
  { category: "FEATURE_REQUEST", priority: "LOW", words: ["feature", "request", "could you add", "would like", "suggestion", "please add"] },
  { category: "TECHNICAL", priority: "MEDIUM", words: ["error", "crash", "timeout", "not saving", "failing", "broken", "blank", "slow", "export"] },
]

const URGENT = ["exam", "deadline", "today", "urgent", "whole school", "all students", "cannot pay", "results due"]

export function heuristicCategorise(title: string, description: string): Categorisation {
  const text = `${title} ${description}`.toLowerCase()

  let match: (typeof RULES)[number] | null = null
  for (const rule of RULES) {
    if (rule.words.some((word) => text.includes(word))) {
      match = rule
      break
    }
  }

  const category = match?.category ?? "OTHER"
  let priority = match?.priority ?? "MEDIUM"
  if (URGENT.some((word) => text.includes(word))) {
    priority = priority === "HIGH" ? "CRITICAL" : "HIGH"
  }

  return {
    category,
    priority,
    suggestedReply:
      "Thank you for reporting this. I am looking into it now and will come back to you today with either a fix or a clear next step.",
    confidence: match ? "medium" : "low",
    generated: false,
    note: "Matched on keywords, not read. Check the category before it drives an SLA clock.",
  }
}

export async function categoriseTicket(input: {
  title: string
  description: string
  school?: string | null
}): Promise<Categorisation> {
  if (!isAIConfigured()) {
    return {
      ...heuristicCategorise(input.title, input.description),
      note: "Anthropic is not configured, so this was matched on keywords rather than read.",
    }
  }

  const reply = await complete({
    prompt: `Triage this ticket.

School: ${input.school ?? "unknown"}
Title: ${input.title}
Description: ${input.description}

Return exactly:
{"category":"BILLING|TECHNICAL|FEATURE_REQUEST|ACCOUNT|OTHER",
 "priority":"LOW|MEDIUM|HIGH|CRITICAL",
 "confidence":"high|medium|low",
 "suggestedReply":"a first reply an agent can send or edit — acknowledge the specific problem, say what happens next, promise nothing you cannot see from the ticket"}`,
    system: TICKET_SYSTEM,
    model: FAST_MODEL,
    effort: "low",
    maxTokens: 1200,
  })

  if (!reply) return heuristicCategorise(input.title, input.description)

  const cleaned = reply.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start === -1 || end <= start) return heuristicCategorise(input.title, input.description)

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
    const category =
      typeof parsed.category === "string" && CATEGORIES.includes(parsed.category as TicketCategory)
        ? (parsed.category as TicketCategory)
        : null
    const priority =
      typeof parsed.priority === "string" && PRIORITIES.includes(parsed.priority as TicketPriority)
        ? (parsed.priority as TicketPriority)
        : null
    const suggestedReply = typeof parsed.suggestedReply === "string" ? parsed.suggestedReply : null

    if (!category || !priority || !suggestedReply) {
      return heuristicCategorise(input.title, input.description)
    }

    return {
      category,
      priority,
      suggestedReply,
      confidence:
        parsed.confidence === "high" || parsed.confidence === "low"
          ? parsed.confidence
          : "medium",
      generated: true,
    }
  } catch {
    return heuristicCategorise(input.title, input.description)
  }
}
