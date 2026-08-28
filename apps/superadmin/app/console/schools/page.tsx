import type { Metadata } from "next"
import type { SchoolPlan, SubscriptionStatus } from "@prisma/client"

import { PageHeader } from "@/components/shared/page-header"
import { listSchools, schoolStates, schoolStatusCounts } from "@/lib/schools"
import { requireRole } from "@/lib/session"
import { SchoolsFilters } from "./schools-filters"
import { SchoolsTable } from "./schools-table"

export const metadata: Metadata = { title: "Schools" }
export const dynamic = "force-dynamic"

const PLANS = ["STARTER", "GROWTH", "PROFESSIONAL", "ENTERPRISE", "GOVERNMENT"]
const STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CHURNED"]

export type SchoolsSearchParams = {
  page?: string
  limit?: string
  search?: string
  state?: string
  plan?: string
  status?: string
  from?: string
  to?: string
  sort?: string
}

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: SchoolsSearchParams
}) {
  await requireRole(
    "BUSINESS_ADMIN",
    "FINANCE_ADMIN",
    "SALES_ADMIN",
    "SUPPORT_ADMIN",
    "ENGINEERING_ADMIN",
  )

  const plan = searchParams.plan && PLANS.includes(searchParams.plan) ? searchParams.plan : undefined
  const status =
    searchParams.status && STATUSES.includes(searchParams.status) ? searchParams.status : undefined

  const [result, counts, states] = await Promise.all([
    listSchools({
      page: Number(searchParams.page ?? 1) || 1,
      limit: Number(searchParams.limit ?? 25) || 25,
      search: searchParams.search?.trim() || undefined,
      state: searchParams.state?.trim() || undefined,
      plan: plan as SchoolPlan | undefined,
      status: status as SubscriptionStatus | undefined,
      from: searchParams.from ? new Date(searchParams.from) : undefined,
      to: searchParams.to ? new Date(searchParams.to) : undefined,
      sort: (searchParams.sort as "name" | "students" | "mrr" | "health" | "created") || "name",
    }),
    schoolStatusCounts(),
    schoolStates(),
  ])

  return (
    <>
      <PageHeader
        title="Schools"
        description={`${result.total} tenant${result.total === 1 ? "" : "s"} matching the current filters`}
      />

      <SchoolsFilters counts={counts} states={states} params={searchParams} total={result.total} />

      <div className="mt-4">
        <SchoolsTable
          rows={result.rows}
          page={result.page}
          pages={result.pages}
          total={result.total}
          limit={result.limit}
          sort={searchParams.sort ?? "name"}
        />
      </div>
    </>
  )
}
