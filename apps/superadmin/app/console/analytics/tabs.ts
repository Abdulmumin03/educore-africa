// Plain module, deliberately not "use client": the page (a server component)
// reads this list to dispatch, and a client module's exports arrive on the
// server as proxies that cannot be mapped over.
export const ANALYTICS_TABS = [
  { key: "adoption", label: "Feature adoption" },
  { key: "cohorts", label: "Cohort retention" },
  { key: "funnel", label: "Growth funnel" },
  { key: "geographic", label: "Geographic" },
  { key: "nps", label: "NPS & satisfaction" },
  { key: "performance", label: "API performance" },
] as const

export type AnalyticsTab = (typeof ANALYTICS_TABS)[number]["key"]
