"use client"

import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { ChevronDown, Download } from "lucide-react"

import { cn, formatNumber } from "@/lib/utils"

export type AuditRow = {
  id: string
  at: string
  userId: string | null
  user: string
  role: string | null
  action: string
  target: string
  targetType: string
  ipAddress: string
  details: Record<string, unknown> | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

type Actor = { id: string; name: string; role: string }

const TARGET_TYPES = ["school", "user", "payment", "config", "ticket", "session", "system"]

export function AuditTable({
  rows,
  total,
  page,
  pages,
  actions,
  actors,
}: {
  rows: AuditRow[]
  total: number
  page: number
  pages: number
  actions: string[]
  actors: Actor[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [expanded, setExpanded] = React.useState<string | null>(null)

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete("page")
    next.set("tab", "trail")
    router.push(`/console/audit?${next.toString()}`)
  }

  function goto(nextPage: number) {
    const next = new URLSearchParams(params.toString())
    next.set("page", String(nextPage))
    next.set("tab", "trail")
    router.push(`/console/audit?${next.toString()}`)
  }

  // The export honours the filters on screen, so what downloads is what is
  // being looked at.
  const exportParams = new URLSearchParams(params.toString())
  exportParams.delete("tab")
  exportParams.delete("page")

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-caption uppercase tracking-wide text-sa-dim">
          From
          <input
            type="date"
            defaultValue={params.get("from") ?? ""}
            onChange={(event) => set("from", event.target.value)}
            className="mt-1 block h-8 rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
          />
        </label>
        <label className="text-caption uppercase tracking-wide text-sa-dim">
          To
          <input
            type="date"
            defaultValue={params.get("to") ?? ""}
            onChange={(event) => set("to", event.target.value)}
            className="mt-1 block h-8 rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
          />
        </label>
        <label className="text-caption uppercase tracking-wide text-sa-dim">
          User
          <select
            defaultValue={params.get("userId") ?? ""}
            onChange={(event) => set("userId", event.target.value)}
            className="mt-1 block h-8 rounded-md border border-sa-border bg-sa-raised px-2 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
          >
            <option value="">Anyone</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-caption uppercase tracking-wide text-sa-dim">
          Action
          <select
            defaultValue={params.get("action") ?? ""}
            onChange={(event) => set("action", event.target.value)}
            className="mt-1 block h-8 max-w-[200px] rounded-md border border-sa-border bg-sa-raised px-2 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
          >
            <option value="">Any action</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <label className="text-caption uppercase tracking-wide text-sa-dim">
          Target type
          <select
            defaultValue={params.get("targetType") ?? ""}
            onChange={(event) => set("targetType", event.target.value)}
            className="mt-1 block h-8 rounded-md border border-sa-border bg-sa-raised px-2 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
          >
            <option value="">Any</option>
            {TARGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <a
          href={`/api/audit/logs/export?${exportParams.toString()}`}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export as PDF
        </a>
      </div>

      <section className="rounded-lg border border-sa-border bg-sa-surface">
        <header className="flex items-center justify-between border-b border-sa-border px-4 py-2">
          <p className="text-caption text-sa-dim">
            {formatNumber(total)} entr{total === 1 ? "y" : "ies"} · page {page} of {pages}
          </p>
        </header>

        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-body text-sa-muted">Nothing matches those filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Timestamp
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    User
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Role
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Action
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Target
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    IP
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const hasDetail = Boolean(row.before || row.after || row.details)
                  const open = expanded === row.id
                  return (
                    <React.Fragment key={row.id}>
                      <tr className="border-b border-sa-border/60 last:border-0">
                        <td className="px-4 py-1.5 font-mono text-caption tabular-nums text-sa-dim">
                          {new Date(row.at).toLocaleString("en-GB")}
                        </td>
                        <td className="px-3 py-1.5 text-sa-text">{row.user}</td>
                        <td className="px-3 py-1.5 text-caption text-sa-muted">
                          {row.role ? row.role.replace(/_/g, " ").toLowerCase() : "—"}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-caption text-sa-text">{row.action}</td>
                        <td className="max-w-[220px] truncate px-3 py-1.5 font-mono text-caption text-sa-muted" title={row.target}>
                          {row.target}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-caption tabular-nums text-sa-dim">
                          {row.ipAddress}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {hasDetail ? (
                            <button
                              type="button"
                              aria-expanded={open}
                              onClick={() => setExpanded(open ? null : row.id)}
                              className="inline-flex items-center gap-1 text-caption text-sa-blue hover:underline"
                            >
                              {open ? "Hide" : "Show"}
                              <ChevronDown
                                className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
                                aria-hidden="true"
                              />
                            </button>
                          ) : (
                            <span className="text-caption text-sa-disabled">—</span>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-sa-border/60 bg-sa-raised/30">
                          <td colSpan={7} className="px-4 py-2">
                            {row.before || row.after ? (
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                  <p className="mb-1 text-caption uppercase tracking-wide text-sa-dim">
                                    Before
                                  </p>
                                  <pre className="overflow-x-auto rounded bg-sa-base/60 p-2 font-mono text-[11px] text-sa-red">
                                    {JSON.stringify(row.before ?? {}, null, 2)}
                                  </pre>
                                </div>
                                <div>
                                  <p className="mb-1 text-caption uppercase tracking-wide text-sa-dim">
                                    After
                                  </p>
                                  <pre className="overflow-x-auto rounded bg-sa-base/60 p-2 font-mono text-[11px] text-sa-green">
                                    {JSON.stringify(row.after ?? {}, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <p className="mb-1 text-caption uppercase tracking-wide text-sa-dim">
                                  Details — this action recorded no before/after pair
                                </p>
                                <pre className="overflow-x-auto rounded bg-sa-base/60 p-2 font-mono text-[11px] text-sa-muted">
                                  {JSON.stringify(row.details ?? {}, null, 2)}
                                </pre>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-end gap-1.5 border-t border-sa-border px-4 py-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goto(page - 1)}
              className="h-7 rounded-md border border-sa-border px-2.5 text-caption text-sa-muted transition-colors hover:text-sa-text disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => goto(page + 1)}
              className="h-7 rounded-md border border-sa-border px-2.5 text-caption text-sa-muted transition-colors hover:text-sa-text disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </section>

      <p className="text-caption text-sa-dim">
        The PDF carries a SHA-256 digest of the rows it contains. That detects alteration of the
        export; it is not a cryptographic signature and does not certify who issued it — this
        platform has no signing certificate, and the document says so on every page.
      </p>
    </div>
  )
}
