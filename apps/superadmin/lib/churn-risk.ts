import { randomUUID } from "node:crypto"
import type { ChurnRiskLevel } from "@prisma/client"

import { FAST_MODEL, complete, isAIConfigured } from "@/lib/ai"
import { prisma } from "@/lib/db"
import { monthlyAmount } from "@/lib/metrics"

// Churn risk.
//
// The SCORE is arithmetic over four observed signals — the same rule the trial
// scorer follows. Claude is asked only to write the reason and the action, and
// every row records which half it got. A model-guessed risk number that moved
// between runs could not be trended, argued with, or tested, and trending it is
// the entire reason the table keeps history.

export type ChurnSignals = {
  /** Days since anybody at the school last signed in. 999 = never. */
  daysSinceLogin: number
  /** Distinct modules with any activity, out of the eight that exist. */
  modulesUsed: number
  /** Support tickets opened in the last 60 days. */
  recentTickets: number
  /** Days past due on the oldest unsettled charge. 0 = nothing outstanding. */
  daysOverdue: number
  /** Monthly-equivalent revenue at stake. */
  mrr: number
  /** Students on the roll — a proxy for how embedded the platform is. */
  students: number
}

// Weights sum to 100. Ordered by how strongly each predicts a Nigerian K-12
// school walking away: silence first (a school that has stopped logging in has
// usually already left), then money, then shallow adoption, then complaints.
const WEIGHTS = { silence: 40, payment: 25, adoption: 20, friction: 15 }

/**
 * 0–100, higher = more likely to churn.
 *
 * Every axis is capped before weighting: 90 days of silence and 300 days of
 * silence are both "gone", and letting the second one dominate would push
 * every other signal out of the score.
 */
export function churnScore(signals: ChurnSignals): number {
  const silence = Math.min(1, signals.daysSinceLogin / 45) * WEIGHTS.silence
  const payment = Math.min(1, signals.daysOverdue / 60) * WEIGHTS.payment
  // Inverted: fewer modules is worse.
  const adoption = (1 - Math.min(1, signals.modulesUsed / 5)) * WEIGHTS.adoption
  const friction = Math.min(1, signals.recentTickets / 6) * WEIGHTS.friction

  return Math.round(silence + payment + adoption + friction)
}

export function riskLevel(score: number): ChurnRiskLevel {
  if (score >= 70) return "CRITICAL"
  if (score >= 45) return "HIGH"
  if (score >= 22) return "MEDIUM"
  return "LOW"
}

/** Which weighted axis is furthest from healthy — the one worth naming. */
export function dominantSignal(signals: ChurnSignals): string {
  const axes: Array<[string, number]> = [
    ["silence", Math.min(1, signals.daysSinceLogin / 45) * WEIGHTS.silence],
    ["payment", Math.min(1, signals.daysOverdue / 60) * WEIGHTS.payment],
    ["adoption", (1 - Math.min(1, signals.modulesUsed / 5)) * WEIGHTS.adoption],
    ["friction", Math.min(1, signals.recentTickets / 6) * WEIGHTS.friction],
  ]
  return axes.sort((a, b) => b[1] - a[1])[0][0]
}

/** Plain-English reason and action, used when Anthropic is not configured. */
export function heuristicVerdict(signals: ChurnSignals): {
  primaryReason: string
  recommendedAction: string
} {
  switch (dominantSignal(signals)) {
    case "silence":
      return {
        primaryReason:
          signals.daysSinceLogin >= 900
            ? "Nobody at the school has ever signed in."
            : `Nobody has signed in for ${signals.daysSinceLogin} days.`,
        recommendedAction: "Call the school administrator directly — email has not reached them.",
      }
    case "payment":
      return {
        primaryReason: `An invoice is ${signals.daysOverdue} days overdue.`,
        recommendedAction: "Confirm whether this is a billing problem or a decision to leave.",
      }
    case "adoption":
      return {
        primaryReason: `Only ${signals.modulesUsed} of 8 modules are in use.`,
        recommendedAction: "Book an onboarding session on the modules their plan already includes.",
      }
    default:
      return {
        primaryReason: `${signals.recentTickets} support tickets in the last 60 days.`,
        recommendedAction: "Review the open tickets before the next renewal conversation.",
      }
  }
}

export type ScoredSchool = {
  schoolId: string
  school: string
  state: string | null
  plan: string | null
  signals: ChurnSignals
  score: number
  level: ChurnRiskLevel
  primaryReason: string
  recommendedAction: string
  generated: boolean
}

type RawRow = {
  id: string
  name: string
  state: string | null
  plan: string | null
  amount: string | null
  cycle: string | null
  last_login: Date | null
  students: bigint
  recent_tickets: bigint
  days_overdue: bigint
  modules_used: bigint
}

/**
 * Gather the signals for every school that is still paying us something.
 *
 * One statement rather than six queries per school: scoring the whole platform
 * weekly is the point, and a per-school round trip would make that a job
 * nobody runs.
 */
export async function gatherSignals(): Promise<ScoredSchool[]> {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      s."id",
      s."name",
      s."state",
      sub."plan"::text   AS plan,
      sub."amount"::text AS amount,
      sub."cycle"::text  AS cycle,
      (SELECT max(u."last_login_at") FROM "users" u WHERE u."school_id" = s."id") AS last_login,
      (SELECT count(*) FROM "students" st WHERE st."school_id" = s."id" AND st."deleted_at" IS NULL)::bigint AS students,
      (SELECT count(*) FROM "support_tickets" t
         WHERE t."school_id" = s."id" AND t."created_at" > now() - interval '60 days')::bigint AS recent_tickets,
      COALESCE((SELECT max(date_part('day', now() - x."due_date"))::int FROM "subscription_transactions" x
         WHERE x."school_id" = s."id" AND x."status" = 'FAILED' AND x."due_date" < now()), 0)::bigint AS days_overdue,
      (
        (CASE WHEN EXISTS (SELECT 1 FROM "attendance" t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM "grades" t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM "fee_invoices" t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM "announcements" t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM "assignments" t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM "libraries" t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM "bus_routes" t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM "hostels" t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END)
      )::bigint AS modules_used
    FROM "schools" s
    JOIN "school_subscriptions" sub ON sub."school_id" = s."id"
    WHERE s."deleted_at" IS NULL
      AND sub."status" IN ('ACTIVE', 'PAST_DUE')
    ORDER BY s."name"
  `

  const now = Date.now()

  return rows.map((row) => {
    const signals: ChurnSignals = {
      // 999 rather than 0 for "never signed in": a school nobody has ever
      // opened is the worst case, not the best.
      daysSinceLogin: row.last_login
        ? Math.floor((now - row.last_login.getTime()) / 86_400_000)
        : 999,
      modulesUsed: Number(row.modules_used),
      recentTickets: Number(row.recent_tickets),
      daysOverdue: Number(row.days_overdue),
      mrr:
        row.amount && row.cycle
          ? monthlyAmount(Number(row.amount), row.cycle as "MONTHLY" | "TERMLY" | "ANNUAL")
          : 0,
      students: Number(row.students),
    }
    const score = churnScore(signals)
    const verdict = heuristicVerdict(signals)

    return {
      schoolId: row.id,
      school: row.name,
      state: row.state,
      plan: row.plan,
      signals,
      score,
      level: riskLevel(score),
      ...verdict,
      generated: false,
    }
  })
}

const SYSTEM = `You are a customer-success lead at EduCore Africa, which sells \
school-management software to Nigerian K-12 schools. Terms run three to a year, \
so a quiet fortnight mid-term reads differently from a quiet fortnight in \
September. Reply with JSON only — no prose, no code fences. Work strictly from \
the figures given; never invent a fact about a school.`

function buildPrompt(schools: ScoredSchool[]): string {
  const table = schools
    .map(
      (s) =>
        `${s.schoolId}\t${s.school}\tscore=${s.score}\t${s.level}\t` +
        `${s.signals.daysSinceLogin}d silent\t${s.signals.modulesUsed}/8 modules\t` +
        `${s.signals.recentTickets} tickets\t${s.signals.daysOverdue}d overdue\t` +
        `${s.signals.students} students`,
    )
    .join("\n")

  return `These schools scored highest for churn risk this week. The score is \
already computed and is NOT yours to revise — write only the reason and the action.

id\tschool\tscore\tlevel\tsilence\tadoption\ttickets\toverdue\tsize

${table}

Return exactly:
{"schools":[{"schoolId":"...","primaryReason":"one sentence naming the figure that matters most","recommendedAction":"one concrete thing an account manager should do this week"}]}`
}

function parse(text: string): Map<string, { primaryReason: string; recommendedAction: string }> {
  const out = new Map<string, { primaryReason: string; recommendedAction: string }>()
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start === -1 || end <= start) return out

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      schools?: Array<{ schoolId?: string; primaryReason?: string; recommendedAction?: string }>
    }
    for (const entry of parsed.schools ?? []) {
      if (
        typeof entry.schoolId === "string" &&
        typeof entry.primaryReason === "string" &&
        typeof entry.recommendedAction === "string"
      ) {
        out.set(entry.schoolId, {
          primaryReason: entry.primaryReason,
          recommendedAction: entry.recommendedAction,
        })
      }
    }
  } catch {
    // Fall back to the heuristic verdicts already on every row.
  }
  return out
}

/** Only the sharp end gets a model call — the rest keep their computed verdict. */
const NARRATED_LIMIT = 25

export type ChurnRunResult = {
  batchId: string
  scored: number
  narrated: number
  byLevel: Record<ChurnRiskLevel, number>
  mrrAtRisk: number
  generated: boolean
}

/**
 * Score every paying school and persist the batch.
 *
 * The write is one transaction: the previous batch is un-flagged and the new
 * rows land together, so a reader never sees two "latest" scores for a school
 * or none at all.
 */
export async function runChurnScoring(): Promise<ChurnRunResult> {
  const schools = await gatherSignals()
  const batchId = randomUUID()

  let narrated = 0
  if (isAIConfigured() && schools.length > 0) {
    const worst = [...schools].sort((a, b) => b.score - a.score).slice(0, NARRATED_LIMIT)
    const reply = await complete({
      prompt: buildPrompt(worst),
      system: SYSTEM,
      model: FAST_MODEL,
      effort: "low",
      maxTokens: 8000,
    })
    if (reply) {
      const verdicts = parse(reply)
      for (const school of schools) {
        const verdict = verdicts.get(school.schoolId)
        if (!verdict) continue
        school.primaryReason = verdict.primaryReason
        school.recommendedAction = verdict.recommendedAction
        school.generated = true
        narrated += 1
      }
    }
  }

  if (schools.length > 0) {
    await prisma.$transaction([
      prisma.churnRiskScore.updateMany({ where: { isLatest: true }, data: { isLatest: false } }),
      prisma.churnRiskScore.createMany({
        data: schools.map((school) => ({
          schoolId: school.schoolId,
          batchId,
          level: school.level,
          score: school.score,
          primaryReason: school.primaryReason,
          recommendedAction: school.recommendedAction,
          signals: school.signals,
          generated: school.generated,
          isLatest: true,
        })),
      }),
    ])
  }

  const byLevel = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 } as Record<ChurnRiskLevel, number>
  for (const school of schools) byLevel[school.level] += 1

  return {
    batchId,
    scored: schools.length,
    narrated,
    byLevel,
    // Only HIGH and CRITICAL count as "at risk" — summing every school's MRR
    // would just restate platform MRR and mean nothing.
    mrrAtRisk: schools
      .filter((school) => school.level === "HIGH" || school.level === "CRITICAL")
      .reduce((sum, school) => sum + school.signals.mrr, 0),
    generated: narrated > 0,
  }
}

export type LatestScore = {
  schoolId: string
  school: string
  state: string | null
  level: ChurnRiskLevel
  score: number
  primaryReason: string
  recommendedAction: string
  signals: ChurnSignals
  generated: boolean
  computedAt: string
  /** Movement against the previous batch, where one exists. */
  delta: number | null
}

export async function latestScores(options: { level?: ChurnRiskLevel; limit?: number } = {}) {
  const rows = await prisma.churnRiskScore.findMany({
    where: { isLatest: true, ...(options.level ? { level: options.level } : {}) },
    orderBy: { score: "desc" },
    take: options.limit ?? 200,
    select: {
      schoolId: true,
      level: true,
      score: true,
      primaryReason: true,
      recommendedAction: true,
      signals: true,
      generated: true,
      computedAt: true,
      school: { select: { name: true, state: true } },
    },
  })

  // Previous score per school, for the movement arrow. One query rather than
  // one per row.
  const previous = await prisma.$queryRaw<Array<{ school_id: string; score: number }>>`
    SELECT DISTINCT ON (c."school_id") c."school_id", c."score"
    FROM "churn_risk_scores" c
    WHERE c."is_latest" = false
    ORDER BY c."school_id", c."computed_at" DESC
  `
  const before = new Map(previous.map((row) => [row.school_id, row.score]))

  const scores: LatestScore[] = rows.map((row) => ({
    schoolId: row.schoolId,
    school: row.school.name,
    state: row.school.state,
    level: row.level,
    score: row.score,
    primaryReason: row.primaryReason,
    recommendedAction: row.recommendedAction,
    signals: row.signals as ChurnSignals,
    generated: row.generated,
    computedAt: row.computedAt.toISOString(),
    delta: before.has(row.schoolId) ? row.score - (before.get(row.schoolId) as number) : null,
  }))

  const byLevel = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 } as Record<ChurnRiskLevel, number>
  for (const score of scores) byLevel[score.level] += 1

  return {
    scores,
    byLevel,
    computedAt: scores[0]?.computedAt ?? null,
    mrrAtRisk: scores
      .filter((score) => score.level === "HIGH" || score.level === "CRITICAL")
      .reduce((sum, score) => sum + score.signals.mrr, 0),
  }
}
