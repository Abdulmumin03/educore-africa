"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { AlertTriangle, Lock, Sparkles, X } from "lucide-react"

import { SlaChip } from "./sla-chip"
import type { SlaTimer } from "@/lib/support"
import { cn } from "@/lib/utils"

type Comment = {
  id: string
  body: string
  isInternal: boolean
  createdAt: string
  author: string
  authorKind: "staff" | "school"
}

type Ticket = {
  id: string
  title: string
  description: string
  category: string
  priority: string
  status: string
  assignedTo: string | null
  assignedName: string | null
  createdAt: string
  firstResponseAt: string | null
  resolvedAt: string | null
  escalatedAt: string | null
  schoolId: string
  school: { name: string; slug: string; state: string | null }
  sla: SlaTimer
  comments: Comment[]
}

const STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_ON_CLIENT", label: "Waiting on client" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
]

const PRIORITIES = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
]

const CATEGORIES = [
  { value: "BILLING", label: "Billing" },
  { value: "TECHNICAL", label: "Technical" },
  { value: "FEATURE_REQUEST", label: "Feature request" },
  { value: "ACCOUNT", label: "Account" },
  { value: "OTHER", label: "Other" },
]

const LABEL: Record<string, string> = Object.fromEntries(
  [...CATEGORIES, ...PRIORITIES].map((option) => [option.value, option.label]),
)

type Triage = {
  category: string
  priority: string
  suggestedReply: string
  confidence: "high" | "medium" | "low"
  generated: boolean
  note?: string
}

const CONFIDENCE_TONE: Record<string, string> = {
  high: "text-sa-green",
  medium: "text-sa-amber",
  low: "text-sa-red",
}

/**
 * Ticket detail as a right-hand slide-in.
 *
 * Loaded on demand rather than rendered with the queue: a fifty-row queue
 * would otherwise ship fifty conversation threads the agent will never open.
 */
export function TicketDetail({ ticketId }: { ticketId: string | null }) {
  const router = useRouter()
  const params = useSearchParams()

  const [ticket, setTicket] = React.useState<Ticket | null>(null)
  const [agents, setAgents] = React.useState<Array<{ id: string; name: string; role: string }>>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [triage, setTriage] = React.useState<Triage | null>(null)
  const [triaging, setTriaging] = React.useState(false)

  const [reply, setReply] = React.useState("")
  const [isInternal, setIsInternal] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/support/tickets/${id}`)
      if (!response.ok) throw new Error(`Could not load the ticket (${response.status})`)
      const data = (await response.json()) as { ticket: Ticket; agents: typeof agents }
      setTicket(data.ticket)
      setAgents(data.agents)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (!ticketId) {
      setTicket(null)
      return
    }
    void load(ticketId)
  }, [ticketId, load])

  function close() {
    const next = new URLSearchParams(params.toString())
    next.delete("ticket")
    router.replace(`/console/support${next.toString() ? `?${next.toString()}` : ""}`, { scroll: false })
  }

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && ticketId) close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, params])

  /**
   * Ask for a triage suggestion. Nothing is written by this call — the agent
   * applies the category and priority, or takes the draft, or ignores both.
   * Auto-applying a CRITICAL would start an SLA clock nobody chose to start.
   */
  async function suggestTriage() {
    if (!ticket) return
    setTriaging(true)
    setError(null)
    try {
      const response = await fetch("/api/ai/categorise-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ticket.title,
          description: ticket.description,
          school: ticket.school.name,
        }),
      })
      const data = (await response.json()) as Triage & { error?: string }
      if (!response.ok) throw new Error(data.error ?? "Could not triage this ticket.")
      setTriage(data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setTriaging(false)
    }
  }

  async function send() {
    if (!ticket || !reply.trim()) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/support/tickets/${ticket.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim(), isInternal }),
      })
      const data = (await response.json()) as { comment?: Comment; error?: string }
      if (!response.ok) throw new Error(data.error ?? "Could not post the reply.")
      setReply("")
      await load(ticket.id)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  async function update(patch: Record<string, unknown>) {
    if (!ticket) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/support/tickets/${ticket.id}/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error ?? "Could not update the ticket.")
      await load(ticket.id)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  if (!ticketId) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={close}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={ticket ? ticket.title : "Ticket"}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[560px] flex-col border-l border-sa-border bg-sa-surface shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-sa-border px-4 py-3">
          <div className="min-w-0">
            {loading && !ticket ? (
              <div className="h-5 w-48 animate-pulse rounded bg-sa-raised" />
            ) : (
              <>
                <h2 className="truncate text-h3 text-sa-text">{ticket?.title ?? "Ticket"}</h2>
                {ticket && (
                  <p className="text-caption text-sa-dim">
                    <Link href={`/console/schools/${ticket.schoolId}`} className="hover:text-sa-blue">
                      {ticket.school.name}
                    </Link>
                    {ticket.school.state && ` · ${ticket.school.state}`} · opened{" "}
                    {new Date(ticket.createdAt).toLocaleDateString("en-GB")}
                  </p>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-sa-dim transition-colors hover:bg-sa-raised hover:text-sa-text"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {ticket && (
          <div className="grid grid-cols-2 gap-2 border-b border-sa-border px-4 py-2.5 sm:grid-cols-4">
            <label className="text-caption text-sa-dim">
              Status
              <select
                value={ticket.status}
                disabled={busy}
                onChange={(event) => void update({ status: event.target.value })}
                className="mt-0.5 h-7 w-full rounded border border-sa-border bg-sa-raised px-1.5 text-body text-sa-text focus:border-sa-blue focus:outline-none"
              >
                {STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-caption text-sa-dim">
              Priority
              <select
                value={ticket.priority}
                disabled={busy}
                onChange={(event) => void update({ priority: event.target.value })}
                className="mt-0.5 h-7 w-full rounded border border-sa-border bg-sa-raised px-1.5 text-body text-sa-text focus:border-sa-blue focus:outline-none"
              >
                {PRIORITIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-caption text-sa-dim">
              Category
              <select
                value={ticket.category}
                disabled={busy}
                onChange={(event) => void update({ category: event.target.value })}
                className="mt-0.5 h-7 w-full rounded border border-sa-border bg-sa-raised px-1.5 text-body text-sa-text focus:border-sa-blue focus:outline-none"
              >
                {CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-caption text-sa-dim">
              Assignee
              <select
                value={ticket.assignedTo ?? ""}
                disabled={busy}
                onChange={(event) => void update({ assignedTo: event.target.value || null })}
                className="mt-0.5 h-7 w-full rounded border border-sa-border bg-sa-raised px-1.5 text-body text-sa-text focus:border-sa-blue focus:outline-none"
              >
                <option value="">Unassigned</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {ticket && (
          <div className="flex items-center justify-between gap-3 border-b border-sa-border px-4 py-2">
            <SlaChip sla={ticket.sla} />
            <div className="flex items-center gap-2">
              {ticket.escalatedAt ? (
                <span className="inline-flex items-center gap-1.5 text-caption text-sa-red">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  Escalated {new Date(ticket.escalatedAt).toLocaleDateString("en-GB")}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void update({ escalate: true })}
                  className="h-7 rounded-md border border-sa-border px-2.5 text-caption text-sa-muted transition-colors hover:border-sa-red hover:text-sa-red disabled:opacity-50"
                >
                  Escalate
                </button>
              )}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error && <p className="mb-3 text-body text-sa-red">{error}</p>}

          {loading && !ticket && (
            <div className="space-y-2" aria-busy="true">
              <div className="h-16 animate-pulse rounded bg-sa-raised" />
              <div className="h-16 animate-pulse rounded bg-sa-raised" />
            </div>
          )}

          {ticket && (
            <>
              <article className="mb-3 rounded-md border border-sa-border bg-sa-raised/40 p-3">
                <p className="mb-1 text-caption text-sa-dim">Original request</p>
                <p className="whitespace-pre-wrap text-body text-sa-muted">{ticket.description}</p>
              </article>

              <ol className="space-y-2.5">
                {ticket.comments.map((comment) => (
                  <li
                    key={comment.id}
                    className={cn(
                      "rounded-md border p-3",
                      comment.isInternal
                        // Internal notes are amber-bordered so an agent can never
                        // mistake one for something the school can read.
                        ? "border-sa-amber/40 bg-sa-amber/5"
                        : comment.authorKind === "staff"
                          ? "border-sa-border bg-sa-raised/50"
                          : "border-sa-border bg-transparent",
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-caption font-medium text-sa-text">{comment.author}</span>
                      <span className="text-caption text-sa-dim">
                        {new Date(comment.createdAt).toLocaleString("en-GB")}
                      </span>
                      {comment.isInternal && (
                        <span className="ml-auto inline-flex items-center gap-1 text-caption text-sa-amber">
                          <Lock className="h-3 w-3" aria-hidden="true" />
                          Internal note
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-body text-sa-muted">{comment.body}</p>
                  </li>
                ))}
              </ol>

              {ticket.comments.length === 0 && (
                <p className="text-body text-sa-dim">No replies yet.</p>
              )}
            </>
          )}
        </div>

        {ticket && (
          <div className="border-t border-sa-border px-4 py-2.5">
            {!triage ? (
              <button
                type="button"
                disabled={triaging}
                onClick={() => void suggestTriage()}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-sa-border px-2.5 text-caption text-sa-muted transition-colors hover:border-sa-purple hover:text-sa-purple disabled:opacity-50"
              >
                <Sparkles className={cn("h-3 w-3", triaging && "animate-pulse")} aria-hidden="true" />
                {triaging ? "Reading the ticket…" : "Suggest triage"}
              </button>
            ) : (
              <div className="rounded-md border border-sa-purple/30 bg-sa-purple/5 p-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-caption font-medium uppercase tracking-wide text-sa-purple">
                    {triage.generated ? "Claude suggests" : "Keyword triage suggests"}
                  </span>
                  <span className="text-body text-sa-text">
                    {LABEL[triage.category] ?? triage.category} ·{" "}
                    {LABEL[triage.priority] ?? triage.priority}
                  </span>
                  <span className={cn("text-caption", CONFIDENCE_TONE[triage.confidence])}>
                    {triage.confidence} confidence
                  </span>
                </div>

                {triage.note && <p className="mt-1 text-caption text-sa-dim">{triage.note}</p>}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void update({ category: triage.category, priority: triage.priority })
                    }
                    className="h-7 rounded-md border border-sa-purple/50 px-2.5 text-caption text-sa-purple transition-colors hover:bg-sa-purple/10 disabled:opacity-50"
                  >
                    Apply category &amp; priority
                  </button>
                  <button
                    type="button"
                    disabled={!triage.suggestedReply}
                    onClick={() => setReply(triage.suggestedReply)}
                    className="h-7 rounded-md border border-sa-border px-2.5 text-caption text-sa-muted transition-colors hover:text-sa-text disabled:opacity-50"
                  >
                    Load draft reply
                  </button>
                  <button
                    type="button"
                    onClick={() => setTriage(null)}
                    className="h-7 px-1 text-caption text-sa-dim transition-colors hover:text-sa-text"
                  >
                    Dismiss
                  </button>
                </div>

                {triage.suggestedReply && (
                  <p className="mt-2 border-t border-sa-purple/20 pt-2 text-caption text-sa-muted">
                    &ldquo;{triage.suggestedReply}&rdquo;
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {ticket && (
          <footer className="border-t border-sa-border px-4 py-3">
            <textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={3}
              placeholder={isInternal ? "Internal note — the school never sees this" : "Reply to the school"}
              className={cn(
                "w-full resize-none rounded-md border bg-sa-raised px-2.5 py-2 text-body text-sa-text placeholder:text-sa-disabled focus:outline-none",
                isInternal ? "border-sa-amber/50 focus:border-sa-amber" : "border-sa-border focus:border-sa-blue",
              )}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-caption text-sa-muted">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(event) => setIsInternal(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-sa-border bg-sa-raised"
                />
                Internal note
              </label>
              <button
                type="button"
                disabled={busy || !reply.trim()}
                onClick={() => void send()}
                className="h-8 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:opacity-40"
              >
                {busy ? "Sending…" : isInternal ? "Add note" : "Send reply"}
              </button>
            </div>
          </footer>
        )}
      </aside>
    </>
  )
}
