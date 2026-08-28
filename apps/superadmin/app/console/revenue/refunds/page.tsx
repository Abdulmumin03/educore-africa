import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/shared/page-header"
import { prisma } from "@/lib/db"
import { isLive } from "@/lib/gateways"
import { requireRole } from "@/lib/session"
import { cn, formatCurrency } from "@/lib/utils"
import { RevenueNav } from "../revenue-nav"

export const metadata: Metadata = { title: "Refunds" }
export const dynamic = "force-dynamic"

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-sa-amber/15 text-sa-amber",
  APPROVED: "bg-sa-blue/15 text-sa-blue",
  PROCESSING: "bg-sa-blue/15 text-sa-blue",
  COMPLETED: "bg-sa-green/15 text-sa-green",
  REJECTED: "bg-sa-dim/15 text-sa-dim",
  FAILED: "bg-sa-red/15 text-sa-red",
}

const DATE: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }

export default async function RefundsPage({ searchParams }: { searchParams: { status?: string } }) {
  const user = await requireRole("FINANCE_ADMIN", "BUSINESS_ADMIN")

  const refunds = await prisma.subscriptionRefund.findMany({
    where: searchParams.status
      ? { status: searchParams.status as "PENDING" | "APPROVED" | "COMPLETED" | "FAILED" | "REJECTED" | "PROCESSING" }
      : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      originalAmount: true,
      amount: true,
      reason: true,
      status: true,
      note: true,
      gatewaySent: true,
      approvedById: true,
      createdAt: true,
      schoolId: true,
      school: { select: { name: true } },
      transaction: { select: { reference: true, gateway: true } },
    },
  })

  const approverIds = [...new Set(refunds.map((r) => r.approvedById).filter(Boolean) as string[])]
  const approvers = await prisma.superAdminUser.findMany({
    where: { id: { in: approverIds } },
    select: { id: true, name: true },
  })
  const byId = new Map(approvers.map((a) => [a.id, a.name]))

  const totalRefunded = refunds
    .filter((r) => r.status === "COMPLETED" || r.status === "APPROVED")
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const canRefund = user.role === "FINANCE_ADMIN" || user.role === "SUPER_ADMIN"

  return (
    <>
      <PageHeader
        title="Refunds"
        description={`${refunds.length} on record · ${formatCurrency(totalRefunded)} approved`}
      />
      <RevenueNav />

      {!isLive() && (
        <p className="mb-4 rounded-lg border border-sa-amber/30 bg-sa-amber/5 px-4 py-3 text-body text-sa-amber">
          <strong>Gateway calls are off.</strong> Refunds are recorded in our ledger and marked
          approved, but nothing is sent to Paystack or Flutterwave until <code className="tabular">REFUNDS_LIVE=true</code>{" "}
          and the relevant secret key are set. A console that silently no-ops a refund is worse than
          one that says so — finance would reconcile against money that never left.
        </p>
      )}

      {!canRefund && (
        <p className="mb-4 rounded-lg border border-sa-border bg-sa-surface px-4 py-3 text-body text-sa-muted">
          You can view the refund log. Raising a refund needs the FINANCE_ADMIN role.
        </p>
      )}

      <section className="overflow-hidden rounded-lg border border-sa-border bg-sa-surface">
        <div className="grid grid-cols-[.9fr_1.6fr_1fr_1fr_1fr_1.1fr_1fr] items-center gap-3 border-b border-sa-border bg-sa-base/40 px-4 py-2">
          {["Date", "School", "Original", "Refunded", "Reason", "Approver", "Status"].map((head, index) => (
            <span
              key={head}
              className={cn(
                "text-[11px] font-semibold uppercase tracking-wider text-sa-dim",
                index >= 2 && index <= 3 && "text-right",
              )}
            >
              {head}
            </span>
          ))}
        </div>

        {refunds.length === 0 && (
          <p className="px-4 py-14 text-center text-body text-sa-dim">
            No refunds have been raised. Start one from a settled charge on the Transactions tab.
          </p>
        )}

        {refunds.map((refund) => (
          <div
            key={refund.id}
            className="grid grid-cols-[.9fr_1.6fr_1fr_1fr_1fr_1.1fr_1fr] items-center gap-3 border-b border-sa-border px-4 py-2 last:border-b-0 hover:bg-sa-raised"
          >
            <span className="tabular text-sa-muted">
              {refund.createdAt.toLocaleDateString("en-GB", DATE)}
            </span>
            <Link href={`/console/schools/${refund.schoolId}`} className="truncate hover:text-sa-blue">
              {refund.school.name}
            </Link>
            <span className="tabular text-right text-sa-muted">
              {formatCurrency(Number(refund.originalAmount))}
            </span>
            <span className="tabular text-right">{formatCurrency(Number(refund.amount))}</span>
            <span className="capitalize text-sa-muted">{refund.reason.toLowerCase()}</span>
            <span className="truncate text-sa-muted">
              {refund.approvedById ? (byId.get(refund.approvedById) ?? "Unknown") : "—"}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded px-2 text-caption font-medium",
                  STATUS_TONE[refund.status],
                )}
              >
                {refund.status.toLowerCase()}
              </span>
              {!refund.gatewaySent && refund.status !== "FAILED" && (
                <span
                  title="Recorded in the ledger; not sent to the gateway"
                  className="text-caption text-sa-dim"
                >
                  ledger
                </span>
              )}
            </span>
          </div>
        ))}
      </section>
    </>
  )
}
