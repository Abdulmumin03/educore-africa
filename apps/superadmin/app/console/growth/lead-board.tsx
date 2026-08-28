"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { Plus } from "lucide-react"

import { cn, formatNumber } from "@/lib/utils"

type Stage = "NEW" | "CONTACTED" | "DEMO_SCHEDULED" | "TRIAL_STARTED" | "CONVERTED" | "LOST"

export type LeadCard = {
  id: string
  schoolName: string
  contactName: string
  contactEmail: string | null
  contactPhone: string | null
  state: string | null
  sizeEstimate: number | null
  source: string | null
  notes: string | null
  stage: Stage
  position: number
  owner: string | null
  ownerId: string | null
  lostReason: string | null
  daysInStage: number
  createdAt: string
}

export type Column = { stage: Stage; label: string; tone: string; cards: LeadCard[] }

export type Summary = {
  total: number
  byStage: Record<string, number>
  winRate: number | null
  settled: number
}

const EMPTY = {
  schoolName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  state: "",
  sizeEstimate: "",
  source: "",
  notes: "",
}

/**
 * Kanban pipeline.
 *
 * Drag-and-drop uses the native HTML5 API rather than a library: the board is
 * six columns of small cards, and pulling in a drag framework for that would
 * cost more than it saves. The server resolves the drop position from the
 * neighbouring card ids, so two people dragging at once cannot produce an
 * ordering the board disagrees with.
 */
export function LeadBoard({
  columns: initialColumns,
  summary,
  owners,
}: {
  columns: Column[]
  summary: Summary
  owners: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [columns, setColumns] = React.useState(initialColumns)
  const [dragging, setDragging] = React.useState<LeadCard | null>(null)
  const [over, setOver] = React.useState<{ stage: Stage; index: number } | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [draft, setDraft] = React.useState(EMPTY)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => setColumns(initialColumns), [initialColumns])

  async function reload() {
    const response = await fetch("/api/growth/leads")
    if (response.ok) {
      const body = (await response.json()) as { columns: Column[] }
      setColumns(body.columns)
    }
    router.refresh()
  }

  async function move(card: LeadCard, stage: Stage, index: number) {
    const column = columns.find((entry) => entry.stage === stage)
    if (!column) return

    const without = column.cards.filter((entry) => entry.id !== card.id)
    const afterId = index > 0 ? (without[index - 1]?.id ?? null) : null
    const beforeId = without[index]?.id ?? null

    let lostReason: string | undefined
    if (stage === "LOST" && card.stage !== "LOST") {
      const reason = window.prompt("Why was this lead lost?")
      if (!reason) return
      lostReason = reason
    }

    // Optimistic: the card lands where it was dropped, and only snaps back if
    // the server refuses.
    setColumns((current) =>
      current.map((entry) => {
        if (entry.stage === card.stage && entry.stage !== stage) {
          return { ...entry, cards: entry.cards.filter((one) => one.id !== card.id) }
        }
        if (entry.stage === stage) {
          const cards = entry.cards.filter((one) => one.id !== card.id)
          cards.splice(index, 0, { ...card, stage })
          return { ...entry, cards }
        }
        return entry
      }),
    )

    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/growth/leads/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, afterId, beforeId, lostReason }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not move the lead.")
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/growth/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          sizeEstimate: draft.sizeEstimate === "" ? null : Number(draft.sizeEstimate),
        }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not add the lead.")
      setDraft(EMPTY)
      setCreating(false)
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-4">
          <p className="text-body text-sa-muted">
            <span className="font-mono tabular-nums text-sa-text">{formatNumber(summary.total)}</span>{" "}
            leads
          </p>
          <p className="text-body text-sa-muted">
            Win rate{" "}
            <span className="font-mono tabular-nums text-sa-text">
              {summary.winRate === null ? "—" : `${summary.winRate.toFixed(0)}%`}
            </span>
            <span className="ml-1.5 text-caption text-sa-dim">
              over {formatNumber(summary.settled)} settled — a lead that arrived yesterday is not
              counted as a failure to convert
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((open) => !open)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {creating ? "Cancel" : "Add lead"}
        </button>
      </div>

      {error && <p className="text-body text-sa-red">{error}</p>}

      {creating && (
        <form onSubmit={create} className="grid gap-3 rounded-lg border border-sa-border bg-sa-surface p-4 sm:grid-cols-4">
          {[
            { key: "schoolName" as const, label: "School name", required: true },
            { key: "contactName" as const, label: "Contact name", required: true },
            { key: "contactEmail" as const, label: "Email", required: false },
            { key: "contactPhone" as const, label: "Phone", required: false },
            { key: "state" as const, label: "State", required: false },
            { key: "sizeEstimate" as const, label: "Students (approx)", required: false },
            { key: "source" as const, label: "Source", required: false },
          ].map((field) => (
            <label key={field.key} className="text-caption uppercase tracking-wide text-sa-dim">
              {field.label}
              <input
                required={field.required}
                value={draft[field.key]}
                onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
              />
            </label>
          ))}
          <label className="text-caption uppercase tracking-wide text-sa-dim sm:col-span-4">
            Notes
            <textarea
              rows={2}
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              className="mt-1 w-full resize-none rounded-md border border-sa-border bg-sa-raised px-2.5 py-2 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>
          <div className="sm:col-span-4">
            <button
              type="submit"
              disabled={busy}
              className="h-8 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add lead"}
            </button>
          </div>
        </form>
      )}

      {/* A flex row inside its own scroller, not a 6-column grid: squeezing six
          columns into the content width clipped the card metadata, and a
          kanban is the one layout where sideways scrolling is expected. */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((column) => (
          <section
            key={column.stage}
            onDragOver={(event) => {
              event.preventDefault()
              setOver({ stage: column.stage, index: column.cards.length })
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (dragging) {
                void move(dragging, column.stage, over?.stage === column.stage ? over.index : column.cards.length)
              }
              setDragging(null)
              setOver(null)
            }}
            className={cn(
              "w-[248px] shrink-0 rounded-lg border bg-sa-surface transition-colors",
              over?.stage === column.stage && dragging ? "border-sa-blue" : "border-sa-border",
            )}
          >
            <header className="flex items-center justify-between border-b border-sa-border px-3 py-2">
              <h3 className={cn("text-caption font-medium uppercase tracking-wide", column.tone)}>
                {column.label}
              </h3>
              <span className="font-mono text-caption tabular-nums text-sa-dim">
                {column.cards.length}
              </span>
            </header>

            <ul className="min-h-[120px] space-y-2 p-2">
              {column.cards.map((card, index) => (
                <li
                  key={card.id}
                  draggable
                  onDragStart={() => setDragging(card)}
                  onDragEnd={() => {
                    setDragging(null)
                    setOver(null)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setOver({ stage: column.stage, index })
                  }}
                  className={cn(
                    "cursor-grab rounded-md border border-sa-border bg-sa-raised/60 p-2.5 transition-shadow active:cursor-grabbing",
                    dragging?.id === card.id && "opacity-40",
                    over?.stage === column.stage && over.index === index && dragging && "ring-1 ring-sa-blue",
                  )}
                >
                  <p className="break-words text-body text-sa-text">{card.schoolName}</p>
                  <p className="break-words text-caption text-sa-muted">{card.contactName}</p>
                  <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 break-words text-caption text-sa-dim">
                    {card.state && <span>{card.state}</span>}
                    {card.sizeEstimate !== null && <span>{formatNumber(card.sizeEstimate)} students</span>}
                    {card.source && <span>via {card.source}</span>}
                  </p>
                  <p className="mt-1 flex items-center justify-between gap-2 text-caption text-sa-dim">
                    <span className="truncate">{card.owner ?? "unassigned"}</span>
                    <span
                      className={cn(
                        "shrink-0 font-mono tabular-nums",
                        card.daysInStage > 21 && column.stage !== "CONVERTED" && column.stage !== "LOST"
                          ? "text-sa-amber"
                          : "text-sa-dim",
                      )}
                      title="Days in this column"
                    >
                      {card.daysInStage}d
                    </span>
                  </p>
                  {card.lostReason && (
                    <p className="mt-1 text-caption text-sa-red">{card.lostReason}</p>
                  )}
                </li>
              ))}

              {column.cards.length === 0 && (
                <li className="rounded-md border border-dashed border-sa-border/60 px-2 py-6 text-center text-caption text-sa-disabled">
                  Drop here
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-caption text-sa-dim">
        Leads are separate from schools on purpose: a prospect is not a tenant, so the platform&rsquo;s
        school count never inflates with the pipeline, and a lost lead leaves nothing behind.
        {owners.length > 0 && ` ${owners.length} console accounts can own a lead.`}
      </p>
    </div>
  )
}
