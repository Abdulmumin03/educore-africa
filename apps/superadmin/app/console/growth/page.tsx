import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/shared/page-header"
import { requireRole } from "@/lib/session"
import { GrowthNav } from "./growth-nav"
import { GROWTH_TABS, type GrowthTab } from "./tabs"
import { PipelineTab } from "./tabs/pipeline-tab"
import { ChurnTab } from "./tabs/churn-tab"
import { ReferralsTab } from "./tabs/referrals-tab"
import { TrialsTab } from "./tabs/trials-tab"

export const metadata: Metadata = { title: "Growth" }
export const dynamic = "force-dynamic"

const KEYS = GROWTH_TABS.map((tab) => tab.key) as readonly string[]

function TabSkeleton() {
  return <div className="h-96 animate-pulse rounded-lg border border-sa-border bg-sa-surface" />
}

export default async function GrowthPage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await requireRole("SALES_ADMIN", "BUSINESS_ADMIN")

  const tab: GrowthTab = (
    searchParams.tab && KEYS.includes(searchParams.tab) ? searchParams.tab : "pipeline"
  ) as GrowthTab

  return (
    <>
      <PageHeader
        title="Growth"
        description="Pipeline, trial conversion, referrals and the schools most likely to leave."
      />

      <GrowthNav active={tab} />

      <Suspense key={tab} fallback={<TabSkeleton />}>
        {tab === "pipeline" && <PipelineTab />}
        {tab === "trials" && <TrialsTab />}
        {tab === "referrals" && <ReferralsTab />}
        {tab === "churn" && (
          <ChurnTab canRun={user.role === "SALES_ADMIN" || user.role === "BUSINESS_ADMIN"} />
        )}
      </Suspense>
    </>
  )
}
