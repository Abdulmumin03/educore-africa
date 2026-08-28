"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Download, Search, X } from "lucide-react"

import { PLAN_LABEL, PLAN_ORDER, STATUS_LABEL, STATUS_ORDER } from "@/lib/plans"
import { cn, formatNumber } from "@/lib/utils"
import type { SchoolsSearchParams } from "./page"

const STATUS_TONE: Record<string, string> = {
  ALL: "text-sa-text",
  TRIAL: "text-sa-amber",
  ACTIVE: "text-sa-green",
  PAST_DUE: "text-sa-amber",
  SUSPENDED: "text-sa-red",
  CHURNED: "text-sa-dim",
}

export function SchoolsFilters({
  counts,
  states,
  params,
  total,
}: {
  counts: Record<string, number>
  states: string[]
  params: SchoolsSearchParams
  total: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = React.useState(params.search ?? "")

  // Every filter is a URL param, so the page stays server-rendered and a
  // filtered view can be linked to or bookmarked.
  const setParam = React.useCallback(
    (updates: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") next.delete(key)
        else next.set(key, value)
      }
      // Any filter change invalidates the current page number.
      if (!("page" in updates)) next.delete("page")
      router.push(`${pathname}?${next.toString()}`)
    },
    [pathname, router, searchParams],
  )

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.search ?? "") !== search) setParam({ search: search || undefined })
    }, 350)
    return () => clearTimeout(timer)
    // Re-running on setParam (which changes with searchParams) would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const activeStatus = params.status ?? "ALL"
  const hasFilters = Boolean(
    params.search || params.state || params.plan || params.status || params.from || params.to,
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {["ALL", ...STATUS_ORDER].map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setParam({ status: status === "ALL" ? undefined : status })}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-md border px-3 text-body transition-colors",
              activeStatus === status
                ? "border-sa-border-em bg-sa-raised text-sa-text"
                : "border-sa-border bg-sa-surface text-sa-muted hover:border-sa-border-em hover:text-sa-text",
            )}
          >
            {status === "ALL" ? "All" : STATUS_LABEL[status as keyof typeof STATUS_LABEL]}
            <span className={cn("tabular text-caption", STATUS_TONE[status] ?? "text-sa-dim")}>
              {formatNumber(counts[status] ?? 0)}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sa-dim"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, slug, state or email…"
            aria-label="Search schools"
            className="h-8 w-72 rounded-md border border-sa-border-em/60 bg-sa-base pl-8 pr-2.5 text-body text-sa-text placeholder:text-sa-dim focus:border-sa-blue focus:outline-none focus:ring-2 focus:ring-sa-blue/20"
          />
        </div>

        <select
          value={params.state ?? ""}
          onChange={(event) => setParam({ state: event.target.value || undefined })}
          aria-label="Filter by state"
          className="h-8 rounded-md border border-sa-border-em/60 bg-sa-surface px-2 text-body text-sa-text focus:border-sa-blue focus:outline-none"
        >
          <option value="">All states</option>
          {states.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>

        <select
          value={params.plan ?? ""}
          onChange={(event) => setParam({ plan: event.target.value || undefined })}
          aria-label="Filter by plan"
          className="h-8 rounded-md border border-sa-border-em/60 bg-sa-surface px-2 text-body text-sa-text focus:border-sa-blue focus:outline-none"
        >
          <option value="">All plans</option>
          {PLAN_ORDER.map((plan) => (
            <option key={plan} value={plan}>
              {PLAN_LABEL[plan]}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={params.from ?? ""}
          onChange={(event) => setParam({ from: event.target.value || undefined })}
          aria-label="Registered from"
          className="h-8 rounded-md border border-sa-border-em/60 bg-sa-surface px-2 font-mono text-caption text-sa-text focus:border-sa-blue focus:outline-none"
        />
        <span className="text-caption text-sa-dim">to</span>
        <input
          type="date"
          value={params.to ?? ""}
          onChange={(event) => setParam({ to: event.target.value || undefined })}
          aria-label="Registered to"
          className="h-8 rounded-md border border-sa-border-em/60 bg-sa-surface px-2 font-mono text-caption text-sa-text focus:border-sa-blue focus:outline-none"
        />

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch("")
              router.push(pathname)
            }}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-caption text-sa-muted transition-colors hover:text-sa-text"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </button>
        )}

        <a
          href={`/api/schools/export?${searchParams.toString()}`}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-sa-border-em bg-sa-surface px-3 text-body font-medium text-sa-text transition-colors hover:bg-sa-raised"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export CSV
          <span className="tabular text-caption text-sa-dim">({formatNumber(total)})</span>
        </a>
      </div>
    </div>
  )
}
