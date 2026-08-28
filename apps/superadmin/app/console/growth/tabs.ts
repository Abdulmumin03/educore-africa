export const GROWTH_TABS = [
  { key: "pipeline", label: "Lead pipeline" },
  { key: "trials", label: "Trials" },
  { key: "referrals", label: "Referrals" },
  { key: "churn", label: "At-risk schools" },
] as const

export type GrowthTab = (typeof GROWTH_TABS)[number]["key"]
