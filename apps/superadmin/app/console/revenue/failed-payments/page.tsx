import type { Metadata } from "next"

import { PageHeader } from "@/components/shared/page-header"
import { failedPayments } from "@/lib/revenue"
import { requireRole } from "@/lib/session"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { RevenueNav } from "../revenue-nav"
import { FailedPaymentsTable } from "./failed-payments-table"

export const metadata: Metadata = { title: "Failed payments" }
export const dynamic = "force-dynamic"

export default async function FailedPaymentsPage() {
  const user = await requireRole("BUSINESS_ADMIN", "FINANCE_ADMIN")
  const data = await failedPayments()

  const cards = [
    { label: "Total outstanding", value: formatCurrency(data.totalOutstanding), hint: `${data.items.length} failed charges` },
    { label: "Schools affected", value: formatNumber(data.schoolCount), hint: "distinct tenants" },
    { label: "Avg days overdue", value: formatNumber(data.avgDaysOverdue), hint: "since the due date" },
  ]

  return (
    <>
      <PageHeader
        title="Failed payments"
        description="Charges that did not settle, oldest first. Chasing them is the highest-yield work on this screen."
      />
      <RevenueNav />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-sa-border bg-sa-surface p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">{card.label}</p>
            <p className="tabular mt-1.5 text-[24px] font-bold leading-none">{card.value}</p>
            <p className="mt-1.5 text-caption text-sa-dim">{card.hint}</p>
          </div>
        ))}
      </div>

      <FailedPaymentsTable
        items={data.items}
        canAct={["FINANCE_ADMIN", "BUSINESS_ADMIN", "SUPER_ADMIN"].includes(user.role)}
      />
    </>
  )
}
