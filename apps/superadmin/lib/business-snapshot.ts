import { getAlerts } from "@/lib/alerts"
import { computeGrowthTrend, getPlatformMetrics, getRevenueBreakdown } from "@/lib/metrics"

/**
 * Everything the weekly snapshot needs, shared by the JSON route and the
 * streaming one so the two cannot drift into summarising different figures.
 */

export const SNAPSHOT_CACHE_KEY = "platform:ai-snapshot"
export const SNAPSHOT_CACHE_TTL_SECONDS = 6 * 60 * 60

export const SNAPSHOT_SYSTEM = `You are a business analyst for EduCore Africa, a Nigerian EdTech SaaS \
selling school-management software to K-12 schools. You write for the CEO. \
Be professional, data-driven and direct. Never invent figures — use only the \
numbers given. Amounts are Nigerian naira.`

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
})

export function buildSnapshotPrompt(payload: unknown): string {
  return `Given these platform metrics for the week:

${JSON.stringify(payload, null, 2)}

Write a concise 3-paragraph business summary for the CEO. Cover, in order:
key growth signals, concerns to address, and one specific recommendation.
Return plain prose — no headings, no bullet points, no preamble.`
}

export type SnapshotFacts = Awaited<ReturnType<typeof gatherSnapshotFacts>>

export async function gatherSnapshotFacts() {
  const [metrics, revenue, growth, alerts] = await Promise.all([
    getPlatformMetrics(),
    getRevenueBreakdown(),
    computeGrowthTrend(),
    getAlerts(),
  ])

  const topPlan = [...revenue.byPlan].sort((a, b) => b.mrr - a.mrr)[0] ?? null
  const criticalAlerts = alerts.filter((alert) => alert.severity === "critical").length
  const netAdd = metrics.newSignups - metrics.churned

  // Only what the model needs — rounded, so it is not tempted to quote
  // spurious precision back at us.
  const payload = {
    schools: {
      total: metrics.totalSchools,
      activeLast30Days: metrics.activeSchools,
      onTrial: metrics.trialSchools,
      suspended: metrics.suspendedSchools,
    },
    students: metrics.totalStudents,
    staff: metrics.totalStaff,
    revenue: {
      mrrNaira: Math.round(metrics.mrr),
      arrNaira: Math.round(metrics.arr),
      mrrChangePercent: metrics.trends.mrr === null ? null : Number(metrics.trends.mrr.toFixed(1)),
      byPlan: revenue.byPlan.map((row) => ({
        plan: row.plan,
        schools: row.schools,
        mrrNaira: Math.round(row.mrr),
        sharePercent: Number(row.share.toFixed(1)),
      })),
      topStates: revenue.byState.slice(0, 5).map((row) => ({
        state: row.state,
        schools: row.schools,
        mrrNaira: Math.round(row.mrr),
      })),
    },
    growth: {
      newThisMonth: metrics.newSignups,
      churnedThisMonth: metrics.churned,
      netAdd,
      last6Months: growth.slice(-6),
    },
    actionRequired: alerts.map((alert) => ({
      severity: alert.severity,
      message: alert.message,
      count: alert.count,
    })),
  }

  return { metrics, revenue, growth, alerts, topPlan, criticalAlerts, netAdd, payload }
}

/** Used when no API key is configured, and when the model call fails. */
export function heuristicSummary(facts: {
  metrics: SnapshotFacts["metrics"]
  topPlan: SnapshotFacts["topPlan"]
  netAdd: number
  criticalAlerts: number
}): string {
  const { metrics, topPlan, netAdd, criticalAlerts } = facts
  const mrrTrend = metrics.trends.mrr
  const direction = mrrTrend === null ? "flat" : mrrTrend >= 0 ? "up" : "down"

  return [
    `The platform is carrying ${metrics.totalSchools.toLocaleString("en-NG")} schools, ` +
      `${metrics.activeSchools.toLocaleString("en-NG")} of them active in the last 30 days, ` +
      `serving ${metrics.totalStudents.toLocaleString("en-NG")} students. ` +
      `MRR stands at ${naira.format(metrics.mrr)} (${naira.format(metrics.arr)} annualised), ` +
      `${direction}${mrrTrend === null ? "" : ` ${Math.abs(mrrTrend).toFixed(1)}%`} on last month. ` +
      `${metrics.newSignups} school${metrics.newSignups === 1 ? "" : "s"} joined this month against ` +
      `${metrics.churned} churned, a net add of ${netAdd}.`,
    `${metrics.trialSchools} school${metrics.trialSchools === 1 ? " is" : "s are"} still on trial and ` +
      `${metrics.suspendedSchools} ${metrics.suspendedSchools === 1 ? "is" : "are"} suspended. ` +
      `There ${criticalAlerts === 1 ? "is" : "are"} ${criticalAlerts} critical item${criticalAlerts === 1 ? "" : "s"} ` +
      `on the action list. ${topPlan ? `${topPlan.plan} is the largest revenue tier at ${naira.format(topPlan.mrr)}.` : ""}`,
    `Recommendation: work the trial list before anything else — converting even half of the ` +
      `${metrics.trialSchools} open trials would move MRR more than any other single action available this week.`,
  ].join("\n\n")
}

export type SnapshotBody = {
  text: string
  source: "model" | "heuristic"
  model: string | null
  generatedAt: string
  basedOn: { schools: number; mrr: number; newSignups: number; churned: number }
  cached: boolean
}

export function snapshotBody(
  facts: SnapshotFacts,
  text: string,
  source: "model" | "heuristic",
  model: string | null,
): SnapshotBody {
  return {
    text,
    source,
    model: source === "model" ? model : null,
    generatedAt: new Date().toISOString(),
    basedOn: {
      schools: facts.metrics.totalSchools,
      mrr: facts.metrics.mrr,
      newSignups: facts.metrics.newSignups,
      churned: facts.metrics.churned,
    },
    cached: false,
  }
}
