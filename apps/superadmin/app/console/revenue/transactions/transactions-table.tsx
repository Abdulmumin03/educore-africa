"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  Receipt,
  RotateCcw,
  Search,
  X,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { gatewayDashboardUrl } from "@/lib/gateways"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"
import { RefundDialog } from "./refund-dialog"

export type TxnRow = {
  id: string
  description: string
  amount: number
  currency: string
  gateway: "PAYSTACK" | "FLUTTERWAVE" | "REMITA" | "BANK_TRANSFER" | "CASH" | string
  status: "PENDING" | "SUCCESSFUL" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED"
  reference: string
  gatewayRef: string | null
  failureReason: string | null
  attempts: number
  paidAt: string | null
  dueDate: string | null
  createdAt: string
  schoolId: string
  school: string
  schoolSlug: string
  refunded: number
}

const STATUS_TONE: Record<TxnRow["status"], string> = {
  SUCCESSFUL: "bg-sa-green/15 text-sa-green",
  FAILED: "bg-sa-red/15 text-sa-red",
  PENDING: "bg-sa-blue/15 text-sa-blue",
  REFUNDED: "bg-sa-amber/15 text-sa-amber",
  PARTIALLY_REFUNDED: "bg-sa-amber/15 text-sa-amber",
}

const STATUS_LABEL: Record<TxnRow["status"], string> = {
  SUCCESSFUL: "Successful",
  FAILED: "Failed",
  PENDING: "Pending",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Part refunded",
}

const GATEWAYS = ["PAYSTACK", "FLUTTERWAVE", "REMITA", "BANK_TRANSFER", "CASH"]
const STATUSES: TxnRow["status"][] = ["SUCCESSFUL", "FAILED", "PENDING", "REFUNDED", "PARTIALLY_REFUNDED"]

const DATE: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-sa-border py-2 last:border-b-0">
      <span className="shrink-0 text-sa-muted">{label}</span>
      <span className="min-w-0 break-words text-right">{children}</span>
    </div>
  )
}

export function TransactionsTable({
  rows,
  page,
  pages,
  total,
  limit,
  params,
  canRefund,
}: {
  rows: TxnRow[]
  page: number
  pages: number
  total: number
  limit: number
  params: Record<string, string | undefined>
  canRefund: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [search, setSearch] = React.useState(params.search ?? "")
  const [selected, setSelected] = React.useState<TxnRow | null>(null)
  const [refundTarget, setRefundTarget] = React.useState<TxnRow | null>(null)

  const go = React.useCallback(
    (updates: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (!value) next.delete(key)
        else next.set(key, value)
      }
      if (!("page" in updates)) next.delete("page")
      router.push(`${pathname}?${next.toString()}`)
    },
    [pathname, router, searchParams],
  )

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.search ?? "") !== search) go({ search: search || undefined })
    }, 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  async function resolve(row: TxnRow) {
    try {
      const response = await fetch(`/api/revenue/failed-payments/${row.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Marked resolved from the transaction log" }),
      })
      if (!response.ok) {
        const payload = await response.json()
        toast({ variant: "destructive", title: "Could not resolve", description: payload.error })
        return
      }
      toast({ title: "Marked as resolved" })
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Could not reach the server" })
    }
  }

  const first = total === 0 ? 0 : (page - 1) * limit + 1
  const last = Math.min(page * limit, total)
  const hasFilters = Boolean(params.search || params.status || params.gateway || params.from || params.to)

  return (
    <>
      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sa-dim"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="School, reference or description…"
            aria-label="Search transactions"
            className="h-8 w-72 rounded-md border border-sa-border-em/60 bg-sa-base pl-8 pr-2.5 text-body text-sa-text placeholder:text-sa-dim focus:border-sa-blue focus:outline-none"
          />
        </div>

        <select
          value={params.gateway ?? ""}
          onChange={(event) => go({ gateway: event.target.value || undefined })}
          aria-label="Filter by gateway"
          className="h-8 rounded-md border border-sa-border-em/60 bg-sa-surface px-2 text-body text-sa-text focus:border-sa-blue focus:outline-none"
        >
          <option value="">All gateways</option>
          {GATEWAYS.map((gateway) => (
            <option key={gateway} value={gateway}>
              {gateway.replace(/_/g, " ").toLowerCase()}
            </option>
          ))}
        </select>

        <select
          value={params.status ?? ""}
          onChange={(event) => go({ status: event.target.value || undefined })}
          aria-label="Filter by status"
          className="h-8 rounded-md border border-sa-border-em/60 bg-sa-surface px-2 text-body text-sa-text focus:border-sa-blue focus:outline-none"
        >
          <option value="">All statuses</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={params.from ?? ""}
          onChange={(event) => go({ from: event.target.value || undefined })}
          aria-label="From date"
          className="h-8 rounded-md border border-sa-border-em/60 bg-sa-surface px-2 font-mono text-caption text-sa-text focus:border-sa-blue focus:outline-none"
        />
        <span className="text-caption text-sa-dim">to</span>
        <input
          type="date"
          value={params.to ?? ""}
          onChange={(event) => go({ to: event.target.value || undefined })}
          aria-label="To date"
          className="h-8 rounded-md border border-sa-border-em/60 bg-sa-surface px-2 font-mono text-caption text-sa-text focus:border-sa-blue focus:outline-none"
        />

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch("")
              router.push(pathname)
            }}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-caption text-sa-muted hover:text-sa-text"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </button>
        )}

        <a
          href={`/api/revenue/transactions/export?${searchParams.toString()}`}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-sa-border-em bg-sa-surface px-3 text-body font-medium transition-colors hover:bg-sa-raised"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export Excel
          <span className="tabular text-caption text-sa-dim">({formatNumber(total)})</span>
        </a>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-sa-border bg-sa-surface">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-sa-border bg-sa-base/40">
                {["Date", "School", "Description", "Amount", "Gateway", "Ref", "Status"].map((head, index) => (
                  <th
                    key={head}
                    scope="col"
                    className={cn(
                      "h-8 px-3 text-left text-[11px] font-semibold uppercase tracking-wider text-sa-dim",
                      index === 3 && "text-right",
                    )}
                  >
                    {head}
                  </th>
                ))}
                <th scope="col" className="h-8 w-10 px-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="group border-b border-sa-border last:border-b-0 hover:bg-sa-raised">
                  <td className="tabular h-9 px-3 text-sa-muted">
                    {new Date(row.createdAt).toLocaleDateString("en-GB", DATE)}
                  </td>
                  <td className="h-9 max-w-[180px] px-3">
                    <Link
                      href={`/console/schools/${row.schoolId}`}
                      className="block truncate hover:text-sa-blue"
                    >
                      {row.school}
                    </Link>
                  </td>
                  <td className="h-9 max-w-[200px] truncate px-3 text-sa-muted">{row.description}</td>
                  <td className="tabular h-9 px-3 text-right">
                    {formatCurrency(row.amount)}
                    {row.refunded > 0 && (
                      <span className="ml-1 text-caption text-sa-amber">−{formatCurrency(row.refunded)}</span>
                    )}
                  </td>
                  <td className="h-9 px-3 capitalize text-sa-muted">
                    {row.gateway.replace(/_/g, " ").toLowerCase()}
                  </td>
                  <td className="h-9 max-w-[140px] truncate px-3 font-mono text-caption text-sa-dim">
                    {row.reference}
                  </td>
                  <td className="h-9 px-3">
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded px-2 text-caption font-medium",
                        STATUS_TONE[row.status],
                      )}
                    >
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="h-9 px-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Actions for ${row.reference}`}
                          className="flex h-6 w-6 items-center justify-center rounded text-sa-disabled transition-colors hover:bg-sa-overlay hover:text-sa-text group-hover:text-sa-muted"
                        >
                          <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onSelect={() => setSelected(row)} className="cursor-pointer">
                          <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                          View details
                        </DropdownMenuItem>
                        {canRefund && (
                          <DropdownMenuItem
                            onSelect={() => setRefundTarget(row)}
                            disabled={row.status !== "SUCCESSFUL" && row.status !== "PARTIALLY_REFUNDED"}
                            className="cursor-pointer"
                          >
                            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                            Issue refund
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => void resolve(row)}
                          disabled={row.status !== "FAILED"}
                          className="cursor-pointer"
                        >
                          Mark as resolved
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-14 text-center">
                    <p className="text-body font-medium text-sa-muted">No transactions match</p>
                    <p className="mt-1 text-caption text-sa-dim">
                      Clear a filter, or widen the date range.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sa-border bg-sa-base/40 px-3 py-2">
          <p className="text-caption text-sa-dim">
            Showing <span className="tabular text-sa-muted">{first}</span>–
            <span className="tabular text-sa-muted">{last}</span> of{" "}
            <span className="tabular text-sa-muted">{formatNumber(total)}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => go({ page: String(page - 1) })}
              disabled={page <= 1}
              aria-label="Previous page"
              className="flex h-6 w-6 items-center justify-center rounded-md border border-sa-border-em text-sa-muted transition-colors hover:bg-sa-raised disabled:cursor-not-allowed disabled:border-sa-border disabled:text-sa-disabled"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <span className="tabular text-caption text-sa-muted">
              {page} / {pages}
            </span>
            <button
              type="button"
              onClick={() => go({ page: String(page + 1) })}
              disabled={page >= pages}
              aria-label="Next page"
              className="flex h-6 w-6 items-center justify-center rounded-md border border-sa-border-em text-sa-muted transition-colors hover:bg-sa-raised disabled:cursor-not-allowed disabled:border-sa-border disabled:text-sa-disabled"
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Slide-over */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Close details"
            onClick={() => setSelected(null)}
            className="flex-1 bg-black/50"
          />
          <aside className="w-full max-w-md overflow-y-auto border-l border-sa-border-em bg-sa-surface p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-h2">Transaction</h2>
                <p className="font-mono text-caption text-sa-dim">{selected.reference}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-md text-sa-muted hover:bg-sa-raised hover:text-sa-text"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="text-body">
              <Detail label="School">
                <Link href={`/console/schools/${selected.schoolId}`} className="text-sa-blue">
                  {selected.school}
                </Link>
              </Detail>
              <Detail label="Description">{selected.description}</Detail>
              <Detail label="Amount">
                <span className="tabular">{formatCurrency(selected.amount)}</span>
              </Detail>
              {selected.refunded > 0 && (
                <Detail label="Refunded">
                  <span className="tabular text-sa-amber">{formatCurrency(selected.refunded)}</span>
                </Detail>
              )}
              <Detail label="Status">
                <span
                  className={cn(
                    "inline-flex h-5 items-center rounded px-2 text-caption font-medium",
                    STATUS_TONE[selected.status],
                  )}
                >
                  {STATUS_LABEL[selected.status]}
                </span>
              </Detail>
              <Detail label="Gateway">
                <span className="capitalize">{selected.gateway.replace(/_/g, " ").toLowerCase()}</span>
              </Detail>
              <Detail label="Gateway ref">
                <span className="font-mono text-caption">{selected.gatewayRef ?? "—"}</span>
              </Detail>
              <Detail label="Attempts">
                <span className="tabular">{selected.attempts}</span>
              </Detail>
              {selected.failureReason && (
                <Detail label="Failure">
                  <span className="text-sa-red">{selected.failureReason}</span>
                </Detail>
              )}
              <Detail label="Created">
                <span className="tabular">{new Date(selected.createdAt).toLocaleString("en-GB")}</span>
              </Detail>
              <Detail label="Paid">
                <span className="tabular">
                  {selected.paidAt ? new Date(selected.paidAt).toLocaleString("en-GB") : "—"}
                </span>
              </Detail>
              <Detail label="Due">
                <span className="tabular">
                  {selected.dueDate ? new Date(selected.dueDate).toLocaleDateString("en-GB", DATE) : "—"}
                </span>
              </Detail>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {gatewayDashboardUrl(selected.gateway as "PAYSTACK", selected.gatewayRef) && (
                <a
                  href={gatewayDashboardUrl(selected.gateway as "PAYSTACK", selected.gatewayRef)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sa-border-em bg-sa-surface px-3 text-body font-medium transition-colors hover:bg-sa-raised"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Open in {selected.gateway.toLowerCase()}
                </a>
              )}
              <Link
                href={`/console/schools/${selected.schoolId}`}
                className="inline-flex h-8 items-center rounded-md border border-sa-border-em bg-sa-surface px-3 text-body font-medium transition-colors hover:bg-sa-raised"
              >
                View school
              </Link>
              {canRefund && (selected.status === "SUCCESSFUL" || selected.status === "PARTIALLY_REFUNDED") && (
                <button
                  type="button"
                  onClick={() => {
                    setRefundTarget(selected)
                    setSelected(null)
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sa-amber/40 bg-sa-amber/15 px-3 text-body font-medium text-sa-amber transition-colors hover:bg-sa-amber/25"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Issue refund
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {refundTarget && (
        <RefundDialog
          transaction={refundTarget}
          onClose={() => setRefundTarget(null)}
          onDone={() => {
            setRefundTarget(null)
            router.refresh()
          }}
        />
      )}
    </>
  )
}
