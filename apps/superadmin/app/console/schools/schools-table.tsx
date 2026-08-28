"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Building2, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react"

import { ChurnBadge } from "@/components/shared/churn-badge"
import { PlanBadge } from "@/components/shared/plan-badge"
import { StatusBadge } from "@/components/shared/status-badge"
import { SchoolRowActions } from "./school-row-actions"
import { HEALTH_BAR, HEALTH_TONE, healthBand } from "@/lib/health"
import type { SchoolRow } from "@/lib/schools"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"

function relativeTime(iso: string | null): string {
  if (!iso) return "never"
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 90) return `${days}d`
  return `${Math.round(days / 30)}mo`
}

const COLUMNS: Array<{ key: string; label: string; sortable: boolean; align?: "right" }> = [
  { key: "name", label: "School", sortable: true },
  { key: "state", label: "State", sortable: false },
  { key: "plan", label: "Plan", sortable: false },
  { key: "status", label: "Status", sortable: false },
  { key: "students", label: "Students", sortable: true, align: "right" },
  { key: "mrr", label: "MRR", sortable: true, align: "right" },
  { key: "lastActive", label: "Last active", sortable: false, align: "right" },
  { key: "health", label: "Health", sortable: true },
  { key: "churn", label: "Churn risk", sortable: false },
]

export function SchoolsTable({
  rows,
  page,
  pages,
  total,
  limit,
  sort,
}: {
  rows: SchoolRow[]
  page: number
  pages: number
  total: number
  limit: number
  sort: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const go = React.useCallback(
    (updates: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) next.delete(key)
        else next.set(key, value)
      }
      router.push(`${pathname}?${next.toString()}`)
    },
    [pathname, router, searchParams],
  )

  const first = total === 0 ? 0 : (page - 1) * limit + 1
  const last = Math.min(page * limit, total)

  // MRR and health are derived after the page is fetched, so those two sort
  // the current page only. Everything else sorts in the database.
  const inPageSort = sort === "mrr" || sort === "health"

  return (
    <div className="overflow-hidden rounded-lg border border-sa-border bg-sa-surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body">
          <thead>
            <tr className="border-b border-sa-border bg-sa-base/40">
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "h-8 px-3 text-left text-[11px] font-semibold uppercase tracking-wider text-sa-dim",
                    column.align === "right" && "text-right",
                    // Sticky cells need their own opaque background or the
                    // scrolled content shows through.
                    column.key === "name" && "sticky left-0 z-10 bg-[#131f33]",
                  )}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => go({ sort: column.key, page: undefined })}
                      className={cn(
                        "inline-flex items-center gap-1 transition-colors hover:text-sa-text",
                        sort === column.key && "text-sa-text",
                      )}
                    >
                      {column.label}
                      {sort === column.key ? (
                        <ChevronDown className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
              <th scope="col" className="h-8 w-10 px-3" />
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const band = healthBand(row.health)
              return (
                <tr key={row.id} className="group border-b border-sa-border last:border-b-0 hover:bg-sa-raised">
                  <td className="sticky left-0 z-10 h-9 bg-sa-surface px-3 group-hover:bg-sa-raised">
                    <Link
                      href={`/console/schools/${row.id}`}
                      className="flex min-w-0 items-baseline gap-2 hover:text-sa-blue"
                    >
                      <span className="truncate font-medium">{row.name}</span>
                      <span className="shrink-0 font-mono text-caption text-sa-dim">{row.slug}</span>
                    </Link>
                  </td>
                  <td className="h-9 px-3 text-sa-muted">
                    {row.state ?? <span className="text-sa-disabled">—</span>}
                  </td>
                  <td className="h-9 px-3">
                    {row.plan ? (
                      <PlanBadge plan={row.plan} />
                    ) : (
                      <span className="text-caption text-sa-disabled">No plan</span>
                    )}
                  </td>
                  <td className="h-9 px-3">
                    {row.status ? (
                      <StatusBadge status={row.status} />
                    ) : (
                      <span className="text-caption text-sa-disabled">—</span>
                    )}
                  </td>
                  <td className="tabular h-9 px-3 text-right">{formatNumber(row.students)}</td>
                  <td className="tabular h-9 px-3 text-right">
                    {row.mrr > 0 ? formatCurrency(row.mrr) : <span className="text-sa-disabled">—</span>}
                  </td>
                  <td className="tabular h-9 px-3 text-right text-sa-muted">
                    {relativeTime(row.lastActiveAt)}
                  </td>
                  <td className="h-9 px-3">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-sa-base">
                        <span
                          className={cn("block h-full rounded-full", HEALTH_BAR[band])}
                          style={{ width: `${row.health}%` }}
                        />
                      </span>
                      <span className={cn("tabular w-6 text-right text-caption", HEALTH_TONE[band])}>
                        {row.health}
                      </span>
                    </span>
                  </td>
                  <td className="h-9 px-3">
                    <ChurnBadge level={row.churnLevel} score={row.churnScore} />
                  </td>
                  <td className="h-9 px-3 text-right">
                    <SchoolRowActions school={row} />
                  </td>
                </tr>
              )
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-3 py-14">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Building2 className="h-6 w-6 text-sa-disabled" aria-hidden="true" />
                    <p className="text-body font-medium text-sa-muted">No schools match</p>
                    <p className="max-w-sm text-caption text-sa-dim">
                      Try clearing a filter, or widen the registration date range.
                    </p>
                  </div>
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
          {inPageSort && " · sorted within this page"}
        </p>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-caption text-sa-dim">
            Rows
            <select
              value={limit}
              onChange={(event) => go({ limit: event.target.value, page: undefined })}
              className="h-6 rounded-md border border-sa-border-em bg-sa-surface px-1.5 font-mono text-caption text-sa-text"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>

          <span className="mx-1 h-4 w-px bg-sa-border-em" aria-hidden="true" />

          <button
            type="button"
            onClick={() => go({ page: String(page - 1) })}
            disabled={page <= 1}
            aria-label="Previous page"
            className="flex h-6 w-6 items-center justify-center rounded-md border border-sa-border-em text-sa-muted transition-colors hover:bg-sa-raised hover:text-sa-text disabled:cursor-not-allowed disabled:border-sa-border disabled:text-sa-disabled disabled:hover:bg-transparent"
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
            className="flex h-6 w-6 items-center justify-center rounded-md border border-sa-border-em text-sa-muted transition-colors hover:bg-sa-raised hover:text-sa-text disabled:cursor-not-allowed disabled:border-sa-border disabled:text-sa-disabled disabled:hover:bg-transparent"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
