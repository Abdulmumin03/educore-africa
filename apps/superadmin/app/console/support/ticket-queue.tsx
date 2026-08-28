"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"

import { SlaChip } from "./sla-chip"
import type { SlaTimer } from "@/lib/support"
import { cn } from "@/lib/utils"

export type QueueRow = {
  id: string
  title: string
  category: string
  priority: string
  status: string
  assignedName: string | null
  createdAt: string
  schoolId: string
  school: string
  comments: number
  sla: SlaTimer
}

const PRIORITY_STYLE: Record<string, string> = {
  CRITICAL: "bg-sa-red/15 text-sa-red",
  HIGH: "bg-sa-amber/15 text-sa-amber",
  MEDIUM: "bg-sa-blue/15 text-sa-blue",
  LOW: "bg-sa-dim/15 text-sa-dim",
}

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING_ON_CLIENT: "Waiting on client",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
}

const CATEGORY_LABEL: Record<string, string> = {
  BILLING: "Billing",
  TECHNICAL: "Technical",
  FEATURE_REQUEST: "Feature",
  ACCOUNT: "Account",
  OTHER: "Other",
}

export function TicketQueue({
  rows,
  total,
  page,
  pages,
  openTicketId,
}: {
  rows: QueueRow[]
  total: number
  page: number
  pages: number
  openTicketId: string | null
}) {
  const router = useRouter()
  const params = useSearchParams()

  function open(id: string) {
    const next = new URLSearchParams(params.toString())
    next.set("ticket", id)
    router.replace(`/console/support?${next.toString()}`, { scroll: false })
  }

  function goto(nextPage: number) {
    const next = new URLSearchParams(params.toString())
    next.set("page", String(nextPage))
    next.delete("ticket")
    router.push(`/console/support?${next.toString()}`)
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-sa-border bg-sa-surface px-4 py-10 text-center">
        <p className="text-body text-sa-muted">No tickets match these filters.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-sa-border bg-sa-surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body">
          <thead>
            <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Ticket
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                School
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Priority
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Status
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Assignee
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                SLA
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => open(row.id)}
                aria-selected={openTicketId === row.id}
                className={cn(
                  "cursor-pointer border-b border-sa-border/60 transition-colors last:border-0 hover:bg-sa-raised/50",
                  openTicketId === row.id && "bg-sa-raised",
                )}
              >
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      open(row.id)
                    }}
                    className="text-left text-body text-sa-text hover:text-sa-blue"
                  >
                    {row.title}
                  </button>
                  <p className="text-caption text-sa-dim">
                    {CATEGORY_LABEL[row.category] ?? row.category} ·{" "}
                    {new Date(row.createdAt).toLocaleDateString("en-GB")}
                    {row.comments > 0 && ` · ${row.comments} message${row.comments === 1 ? "" : "s"}`}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/console/schools/${row.schoolId}`}
                    onClick={(event) => event.stopPropagation()}
                    className="text-body text-sa-muted hover:text-sa-blue"
                  >
                    {row.school}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "inline-flex h-5 items-center rounded px-2 text-caption font-medium",
                      PRIORITY_STYLE[row.priority] ?? PRIORITY_STYLE.LOW,
                    )}
                  >
                    {row.priority.charAt(0) + row.priority.slice(1).toLowerCase()}
                  </span>
                </td>
                <td className="px-3 py-2 text-sa-muted">{STATUS_LABEL[row.status] ?? row.status}</td>
                <td className="px-3 py-2 text-sa-muted">
                  {row.assignedName ?? <span className="text-sa-disabled">Unassigned</span>}
                </td>
                <td className="px-3 py-2">
                  <SlaChip sla={row.sla} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-sa-border px-4 py-2">
        <p className="text-caption text-sa-dim">
          Page {page} of {pages} · {total} ticket{total === 1 ? "" : "s"}
        </p>
        <div className="flex gap-1.5">
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
      </div>
    </div>
  )
}
