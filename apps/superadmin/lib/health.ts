import type { SubscriptionStatus } from "@prisma/client"

// A school's health score, 0–100. Deliberately a pure function over signals
// the caller has already fetched, so the directory can score 500 schools from
// a handful of grouped queries rather than one query per row.
//
// Weighting reflects what actually predicts renewal: whether anyone is using
// the thing, and whether the money is arriving.

export type HealthSignals = {
  /** Most recent sign-in by any user at the school. */
  lastActiveAt: Date | null
  /** Share of billed school fees collected, 0–1. Null when nothing is billed. */
  collectionRate: number | null
  /** Distinct modules with data — attendance, grades, finance, etc. */
  modulesInUse: number
  totalModules: number
  subscriptionStatus: SubscriptionStatus | null
  openCriticalTickets: number
}

const WEIGHTS = { activity: 30, collections: 25, adoption: 20, standing: 15, support: 10 }

const DAY_MS = 24 * 60 * 60 * 1000

function activityScore(lastActiveAt: Date | null): number {
  if (!lastActiveAt) return 0
  const days = (Date.now() - lastActiveAt.getTime()) / DAY_MS
  if (days <= 2) return 1
  if (days <= 7) return 0.85
  if (days <= 14) return 0.6
  if (days <= 30) return 0.35
  if (days <= 60) return 0.15
  return 0
}

function standingScore(status: SubscriptionStatus | null): number {
  switch (status) {
    case "ACTIVE":
      return 1
    case "TRIAL":
      return 0.6
    case "PAST_DUE":
      return 0.3
    case "SUSPENDED":
    case "CHURNED":
      return 0
    default:
      return 0.5 // no subscription recorded yet — neither good nor bad
  }
}

export function healthScore(signals: HealthSignals): number {
  const activity = activityScore(signals.lastActiveAt) * WEIGHTS.activity
  // No billing yet is neutral, not a failure — new schools would score zero.
  const collections = (signals.collectionRate ?? 0.7) * WEIGHTS.collections
  const adoption =
    signals.totalModules > 0
      ? (signals.modulesInUse / signals.totalModules) * WEIGHTS.adoption
      : 0
  const standing = standingScore(signals.subscriptionStatus) * WEIGHTS.standing
  const support = Math.max(0, 1 - signals.openCriticalTickets * 0.5) * WEIGHTS.support

  return Math.max(0, Math.min(100, Math.round(activity + collections + adoption + standing + support)))
}

export type HealthBand = "excellent" | "good" | "at-risk" | "critical"

export function healthBand(score: number): HealthBand {
  if (score >= 80) return "excellent"
  if (score >= 60) return "good"
  if (score >= 40) return "at-risk"
  return "critical"
}

export const HEALTH_TONE: Record<HealthBand, string> = {
  excellent: "text-sa-green",
  good: "text-sa-green",
  "at-risk": "text-sa-amber",
  critical: "text-sa-red",
}

export const HEALTH_BAR: Record<HealthBand, string> = {
  excellent: "bg-sa-green",
  good: "bg-sa-green",
  "at-risk": "bg-sa-amber",
  critical: "bg-sa-red",
}
