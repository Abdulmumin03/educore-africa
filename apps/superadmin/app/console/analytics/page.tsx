import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/shared/page-header"
import { requireRole } from "@/lib/session"
import { AnalyticsNav } from "./analytics-nav"
import { ANALYTICS_TABS, type AnalyticsTab } from "./tabs"
import { AdoptionTab } from "./tabs/adoption-tab"
import { CohortsTab } from "./tabs/cohorts-tab"
import { FunnelTab } from "./tabs/funnel-tab"
import { GeographicTab } from "./tabs/geographic-tab"
import { NpsTab } from "./tabs/nps-tab"
import { PerformanceTab } from "./tabs/performance-tab"

export const metadata: Metadata = { title: "Analytics Centre" }
export const dynamic = "force-dynamic"

const KEYS = ANALYTICS_TABS.map((tab) => tab.key) as readonly string[]

function TabSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-24 animate-pulse rounded-lg border border-sa-border bg-sa-surface" />
      <div className="h-72 animate-pulse rounded-lg border border-sa-border bg-sa-surface" />
    </div>
  )
}

/**
 * Six tabs, one per analysis, dispatched from the URL.
 *
 * Only the selected tab's queries run — the feature-adoption matrix and the
 * cohort grid are both heavy enough that rendering all six on every visit
 * would make the page unusable.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { tab?: string; view?: string }
}) {
  await requireRole("ANALYTICS_ADMIN", "BUSINESS_ADMIN", "FINANCE_ADMIN", "SALES_ADMIN")

  const tab: AnalyticsTab = (
    searchParams.tab && KEYS.includes(searchParams.tab) ? searchParams.tab : "adoption"
  ) as AnalyticsTab
  const view = searchParams.view === "table" ? "table" : "map"

  return (
    <>
      <PageHeader
        title="Analytics Centre"
        description="Adoption, retention, funnel, geography, satisfaction and API health."
      />

      <AnalyticsNav active={tab} />

      <Suspense key={`${tab}:${view}`} fallback={<TabSkeleton />}>
        {tab === "adoption" && <AdoptionTab />}
        {tab === "cohorts" && <CohortsTab />}
        {tab === "funnel" && <FunnelTab />}
        {tab === "geographic" && <GeographicTab view={view} />}
        {tab === "nps" && <NpsTab />}
        {tab === "performance" && <PerformanceTab />}
      </Suspense>
    </>
  )
}
