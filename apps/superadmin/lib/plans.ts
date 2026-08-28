import type { SchoolPlan, SubscriptionStatus } from "@prisma/client"

export type PlanKey = SchoolPlan

// The validated categorical set from the design system. These five passed the
// colour-blind separation and contrast checks against #1E293B as an ordered
// adjacent series — do not substitute a hue without re-running the validator.
export const PLAN_COLOUR: Record<PlanKey, string> = {
  STARTER: "#3B82F6",
  GROWTH: "#D97706",
  PROFESSIONAL: "#8B5CF6",
  ENTERPRISE: "#0D9488",
  GOVERNMENT: "#E11D48",
}

export const PLAN_LABEL: Record<PlanKey, string> = {
  STARTER: "Starter",
  GROWTH: "Growth",
  PROFESSIONAL: "Professional",
  ENTERPRISE: "Enterprise",
  GOVERNMENT: "Government",
}

export const PLAN_ORDER: PlanKey[] = [
  "STARTER",
  "GROWTH",
  "PROFESSIONAL",
  "ENTERPRISE",
  "GOVERNMENT",
]

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  TRIAL: "Trial",
  ACTIVE: "Active",
  PAST_DUE: "Past due",
  SUSPENDED: "Suspended",
  CHURNED: "Churned",
}

export const STATUS_ORDER: SubscriptionStatus[] = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
  "CHURNED",
]

export const CYCLE_LABEL: Record<"MONTHLY" | "TERMLY" | "ANNUAL", string> = {
  MONTHLY: "Monthly",
  TERMLY: "Termly (3 months)",
  ANNUAL: "Annual",
}
