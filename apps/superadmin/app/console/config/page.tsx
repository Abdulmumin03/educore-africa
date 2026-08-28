import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/shared/page-header"
import { requireRole } from "@/lib/session"
import { ConfigNav } from "./config-nav"
import { CONFIG_TABS, type ConfigTab } from "./tabs"
import { AnnouncementsTab } from "./tabs/announcements-tab"
import { EmailTab } from "./tabs/email-tab"
import { PlansTab } from "./tabs/plans-tab"
import { PromoTab } from "./tabs/promo-tab"
import { SmsTab } from "./tabs/sms-tab"

export const metadata: Metadata = { title: "Configuration" }
export const dynamic = "force-dynamic"

const KEYS = CONFIG_TABS.map((tab) => tab.key) as readonly string[]

function TabSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-20 animate-pulse rounded-lg border border-sa-border bg-sa-surface" />
      <div className="h-64 animate-pulse rounded-lg border border-sa-border bg-sa-surface" />
    </div>
  )
}

export default async function ConfigPage({ searchParams }: { searchParams: { tab?: string } }) {
  await requireRole("ENGINEERING_ADMIN", "BUSINESS_ADMIN", "FINANCE_ADMIN")

  const tab: ConfigTab = (
    searchParams.tab && KEYS.includes(searchParams.tab) ? searchParams.tab : "plans"
  ) as ConfigTab

  return (
    <>
      <PageHeader
        title="Platform configuration"
        description="Catalogue pricing, promo codes, the wording of every system message, and the banners schools see."
      />

      <ConfigNav active={tab} />

      <Suspense key={tab} fallback={<TabSkeleton />}>
        {tab === "plans" && <PlansTab />}
        {tab === "promo" && <PromoTab />}
        {tab === "email" && <EmailTab />}
        {tab === "sms" && <SmsTab />}
        {tab === "announcements" && <AnnouncementsTab />}
      </Suspense>
    </>
  )
}
