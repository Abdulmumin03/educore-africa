import type { Metadata } from "next"
import type { PaymentChannel, TransactionStatus } from "@prisma/client"

import { PageHeader } from "@/components/shared/page-header"
import { listTransactions } from "@/lib/revenue"
import { requireRole } from "@/lib/session"
import { formatCurrency } from "@/lib/utils"
import { RevenueNav } from "../revenue-nav"
import { TransactionsTable } from "./transactions-table"

export const metadata: Metadata = { title: "Transactions" }
export const dynamic = "force-dynamic"

const STATUSES = ["PENDING", "SUCCESSFUL", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"]
const GATEWAYS = ["PAYSTACK", "FLUTTERWAVE", "REMITA", "BANK_TRANSFER", "CASH"]

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: {
    page?: string
    search?: string
    status?: string
    gateway?: string
    from?: string
    to?: string
  }
}) {
  const user = await requireRole("BUSINESS_ADMIN", "FINANCE_ADMIN", "ANALYTICS_ADMIN")

  const status = searchParams.status && STATUSES.includes(searchParams.status) ? searchParams.status : undefined
  const gateway = searchParams.gateway && GATEWAYS.includes(searchParams.gateway) ? searchParams.gateway : undefined

  const result = await listTransactions({
    page: Number(searchParams.page ?? 1) || 1,
    limit: 25,
    search: searchParams.search?.trim() || undefined,
    status: status as TransactionStatus | undefined,
    gateway: gateway as PaymentChannel | undefined,
    from: searchParams.from ? new Date(searchParams.from) : undefined,
    to: searchParams.to ? new Date(`${searchParams.to}T23:59:59Z`) : undefined,
  })

  const settled = result.totals.SUCCESSFUL?.amount ?? 0

  return (
    <>
      <PageHeader
        title="Transactions"
        description={`${result.total} charges matching the current filters · ${formatCurrency(settled)} settled`}
      />
      <RevenueNav />
      <TransactionsTable
        rows={result.rows}
        page={result.page}
        pages={result.pages}
        total={result.total}
        limit={result.limit}
        params={searchParams}
        canRefund={user.role === "FINANCE_ADMIN" || user.role === "SUPER_ADMIN"}
      />
    </>
  )
}
