"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { Plus } from "lucide-react"

import { cn, formatNumber } from "@/lib/utils"

export type RequestRow = {
  id: string
  type: "ACCESS" | "DELETION" | "PORTABILITY"
  status: "RECEIVED" | "IN_PROGRESS" | "COMPLETED" | "DENIED"
  subjectName: string
  subjectEmail: string
  schoolId: string | null
  school: string | null
  details: string | null
  receivedAt: string
  dueAt: string
  completedAt: string | null
  resolution: string | null
  handledBy: string | null
  daysRemaining: number
  overdue: boolean
  deletions: number
}

export type Summary = {
  total: number
  open: number
  overdue: number
  dueThisWeek: number
  completed: number
}

const STATUS_STYLE: Record<RequestRow["status"], string> = {
  RECEIVED: "bg-sa-blue/15 text-sa-blue",
  IN_PROGRESS: "bg-sa-purple/15 text-sa-purple",
  COMPLETED: "bg-sa-green/15 text-sa-green",
  DENIED: "bg-sa-dim/15 text-sa-dim",
}

const TYPE_LABEL: Record<RequestRow["type"], string> = {
  ACCESS: "Access",
  DELETION: "Deletion",
  PORTABILITY: "Portability",
}

const EMPTY = {
  type: "ACCESS" as RequestRow["type"],
  subjectName: "",
  subjectEmail: "",
  schoolId: "",
  details: "",
  receivedAt: "",
}

export function NdprManager({
  initial,
  summary,
  responseDays,
  canErase,
}: {
  initial: RequestRow[]
  summary: Summary
  responseDays: number
  canErase: boolean
}) {
  const router = useRouter()
  const [rows, setRows] = React.useState(initial)
  const [creating, setCreating] = React.useState(false)
  const [draft, setDraft] = React.useState(EMPTY)
  const [processing, setProcessing] = React.useState<RequestRow | null>(null)
  const [resolution, setResolution] = React.useState("")
  const [nextStatus, setNextStatus] = React.useState<RequestRow["status"]>("IN_PROGRESS")
  const [eraseConfirm, setEraseConfirm] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => setRows(initial), [initial])

  async function reload() {
    const response = await fetch("/api/compliance/requests")
    if (response.ok) {
      setRows(((await response.json()) as { requests: RequestRow[] }).requests)
    }
    router.refresh()
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch("/api/compliance/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, schoolId: draft.schoolId || null, receivedAt: draft.receivedAt || undefined }),
      })
      const body = (await response.json()) as { error?: string; notice?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not log the request.")
      if (body.notice) setNotice(body.notice)
      setDraft(EMPTY)
      setCreating(false)
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  async function process() {
    if (!processing) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/compliance/requests/${processing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, resolution }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not update.")
      setProcessing(null)
      setResolution("")
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  async function erase(row: RequestRow, userId: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch("/api/compliance/execute-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: row.id, userId, confirm: eraseConfirm }),
      })
      const body = (await response.json()) as { error?: string; notice?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not execute the deletion.")
      setNotice(body.notice ?? "Done.")
      setEraseConfirm("")
      setProcessing(null)
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Open", value: summary.open, tone: "text-sa-text" },
          {
            label: "Overdue",
            value: summary.overdue,
            tone: summary.overdue > 0 ? "text-sa-red" : "text-sa-green",
          },
          {
            label: "Due this week",
            value: summary.dueThisWeek,
            tone: summary.dueThisWeek > 0 ? "text-sa-amber" : "text-sa-dim",
          },
          { label: "Completed", value: summary.completed, tone: "text-sa-muted" },
        ].map((card) => (
          <section key={card.label} className="rounded-lg border border-sa-border bg-sa-surface p-4">
            <p className="text-caption uppercase tracking-wide text-sa-dim">{card.label}</p>
            <p className={cn("mt-1 font-mono text-display tabular-nums", card.tone)}>
              {formatNumber(card.value)}
            </p>
          </section>
        ))}
      </div>

      {error && <p className="text-body text-sa-red">{error}</p>}
      {notice && <p className="text-body text-sa-amber">{notice}</p>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-body text-sa-muted">
          NDPR allows {responseDays} days to answer. The due date is stamped when the request is
          logged, so changing the statutory window later cannot silently re-date requests already in
          flight.
        </p>
        <button
          type="button"
          onClick={() => setCreating((open) => !open)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {creating ? "Cancel" : "Log a request"}
        </button>
      </div>

      {creating && (
        <form onSubmit={create} className="grid gap-3 rounded-lg border border-sa-border bg-sa-surface p-4 sm:grid-cols-2">
          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Type
            <select
              value={draft.type}
              onChange={(event) => setDraft({ ...draft, type: event.target.value as RequestRow["type"] })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            >
              <option value="ACCESS">Access</option>
              <option value="DELETION">Deletion</option>
              <option value="PORTABILITY">Portability</option>
            </select>
          </label>
          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Received on (blank = today)
            <input
              type="date"
              value={draft.receivedAt}
              onChange={(event) => setDraft({ ...draft, receivedAt: event.target.value })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>
          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Subject name
            <input
              required
              value={draft.subjectName}
              onChange={(event) => setDraft({ ...draft, subjectName: event.target.value })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>
          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Subject email
            <input
              required
              type="email"
              value={draft.subjectEmail}
              onChange={(event) => setDraft({ ...draft, subjectEmail: event.target.value })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>
          <label className="text-caption uppercase tracking-wide text-sa-dim sm:col-span-2">
            What was asked for
            <textarea
              rows={2}
              value={draft.details}
              onChange={(event) => setDraft({ ...draft, details: event.target.value })}
              className="mt-1 w-full resize-none rounded-md border border-sa-border bg-sa-raised px-2.5 py-2 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="h-8 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:opacity-50"
            >
              {busy ? "Logging…" : "Log request"}
            </button>
          </div>
        </form>
      )}

      <section className="rounded-lg border border-sa-border bg-sa-surface">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-body text-sa-muted">No data subject requests.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Subject
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Type
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    School
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Due
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const settled = row.status === "COMPLETED" || row.status === "DENIED"
                  return (
                    <tr key={row.id} className="border-b border-sa-border/60 last:border-0">
                      <td className="px-4 py-2">
                        <p className="text-sa-text">{row.subjectName}</p>
                        <p className="font-mono text-caption text-sa-dim">{row.subjectEmail}</p>
                      </td>
                      <td className="px-3 py-2 text-sa-muted">{TYPE_LABEL[row.type]}</td>
                      <td className="px-3 py-2 text-caption text-sa-muted">{row.school ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex h-5 items-center rounded px-2 text-caption font-medium",
                            STATUS_STYLE[row.status],
                          )}
                        >
                          {row.status.replace(/_/g, " ").toLowerCase()}
                        </span>
                        {row.deletions > 0 && (
                          <span className="ml-2 text-caption text-sa-dim">
                            {row.deletions} erasure record{row.deletions === 1 ? "" : "s"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={cn(
                            "font-mono text-caption tabular-nums",
                            settled
                              ? "text-sa-dim"
                              : row.overdue
                                ? "text-sa-red"
                                : row.daysRemaining <= 7
                                  ? "text-sa-amber"
                                  : "text-sa-green",
                          )}
                        >
                          {settled
                            ? row.overdue
                              ? "closed late"
                              : "closed in time"
                            : row.overdue
                              ? `${Math.abs(row.daysRemaining)}d overdue`
                              : `${row.daysRemaining}d left`}
                        </span>
                        <p className="font-mono text-[10px] tabular-nums text-sa-dim">
                          {new Date(row.dueAt).toLocaleDateString("en-GB")}
                        </p>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setProcessing(row)
                            setNextStatus(row.status === "RECEIVED" ? "IN_PROGRESS" : "COMPLETED")
                            setResolution(row.resolution ?? "")
                            setEraseConfirm("")
                          }}
                          className="h-7 rounded-md border border-sa-border px-2.5 text-caption text-sa-muted transition-colors hover:text-sa-text"
                        >
                          Process
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {processing && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setProcessing(null)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Process request from ${processing.subjectName}`}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-sa-border bg-sa-surface p-4 shadow-2xl"
          >
            <h3 className="text-h3">{TYPE_LABEL[processing.type]} request</h3>
            <p className="text-caption text-sa-dim">
              {processing.subjectName} · {processing.subjectEmail}
              {processing.school && ` · ${processing.school}`}
            </p>

            {processing.details && (
              <p className="mt-2 rounded-md border border-sa-border bg-sa-raised/40 p-2 text-body text-sa-muted">
                {processing.details}
              </p>
            )}

            <label className="mt-3 block text-caption uppercase tracking-wide text-sa-dim">
              Status
              <select
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value as RequestRow["status"])}
                className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
              >
                <option value="RECEIVED">Received</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="DENIED">Denied</option>
              </select>
            </label>

            <label className="mt-3 block text-caption uppercase tracking-wide text-sa-dim">
              Action taken
              <textarea
                rows={3}
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                placeholder="What was done, and when."
                className="mt-1 w-full resize-none rounded-md border border-sa-border bg-sa-raised px-2.5 py-2 text-body normal-case tracking-normal text-sa-text placeholder:text-sa-disabled focus:border-sa-blue focus:outline-none"
              />
            </label>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void process()}
                className="h-8 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setProcessing(null)}
                className="h-8 rounded-md border border-sa-border px-3 text-body text-sa-muted transition-colors hover:text-sa-text"
              >
                Cancel
              </button>
            </div>

            {processing.type === "DELETION" && (
              <div className="mt-4 rounded-md border border-sa-red/40 bg-sa-red/5 p-3">
                <p className="text-body font-medium text-sa-red">Execute erasure</p>
                <p className="mt-1 text-caption text-sa-muted">
                  Removes identifying fields and disables the account. Academic and financial rows
                  stay, unattributed — deleting them would erase the school&rsquo;s own records.
                  This cannot be undone.
                </p>
                {!canErase ? (
                  <p className="mt-2 text-caption text-sa-dim">
                    Only a SUPER_ADMIN can run an erasure.
                  </p>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={eraseConfirm}
                      onChange={(event) => setEraseConfirm(event.target.value.toUpperCase())}
                      placeholder="Type ERASE"
                      className="h-8 w-32 rounded-md border border-sa-red/40 bg-sa-raised px-2.5 font-mono text-body text-sa-text placeholder:text-sa-disabled focus:border-sa-red focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={busy || eraseConfirm !== "ERASE"}
                      onClick={() => {
                        const userId = window.prompt(
                          "User id to erase (from the users section, or leave blank to cancel)",
                        )
                        if (userId) void erase(processing, userId)
                      }}
                      className="h-8 rounded-md bg-sa-red px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-red/90 disabled:opacity-40"
                    >
                      Erase subject
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
