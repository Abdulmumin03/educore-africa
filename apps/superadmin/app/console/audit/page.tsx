import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/shared/page-header"
import { requireRole } from "@/lib/session"
import { AuditNav } from "./audit-nav"
import { AUDIT_TABS, type AuditTab } from "./tabs"
import { AccessTab } from "./tabs/access-tab"
import { DeletionsTab } from "./tabs/deletions-tab"
import { NdprTab } from "./tabs/ndpr-tab"
import { TrailTab } from "./tabs/trail-tab"

export const metadata: Metadata = { title: "Audit & Compliance" }
export const dynamic = "force-dynamic"

const KEYS = AUDIT_TABS.map((tab) => tab.key) as readonly string[]

function TabSkeleton() {
  return <div className="h-96 animate-pulse rounded-lg border border-sa-border bg-sa-surface" />
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  const me = await requireRole("ENGINEERING_ADMIN")

  const tab: AuditTab = (
    searchParams.tab && KEYS.includes(searchParams.tab) ? searchParams.tab : "trail"
  ) as AuditTab

  return (
    <>
      <PageHeader
        title="Audit &amp; compliance"
        description="Every action taken in this console, every cross-tenant read, and the NDPR record that goes with them."
      />

      <AuditNav active={tab} />

      <Suspense key={`${tab}:${JSON.stringify(searchParams)}`} fallback={<TabSkeleton />}>
        {tab === "trail" && <TrailTab searchParams={searchParams} />}
        {tab === "access" && <AccessTab searchParams={searchParams} />}
        {tab === "ndpr" && <NdprTab canErase={me.role === "SUPER_ADMIN"} />}
        {tab === "deletions" && <DeletionsTab />}
      </Suspense>
    </>
  )
}
