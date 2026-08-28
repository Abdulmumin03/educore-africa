"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { AlertTriangle, Info, Plus, Wrench } from "lucide-react"

import { cn, formatNumber } from "@/lib/utils"

type AnnouncementType = "INFO" | "WARNING" | "MAINTENANCE"

export type AnnouncementRow = {
  id: string
  title: string
  body: string
  type: AnnouncementType
  startsAt: string
  endsAt: string | null
  targetPlans: string[]
  isActive: boolean
  dismissible: boolean
  createdAt: string
  createdBy: string
  window: "scheduled" | "live" | "ended" | "off"
  reach: number
}

const PLANS = ["STARTER", "GROWTH", "PROFESSIONAL", "ENTERPRISE", "GOVERNMENT"]

const TYPE_STYLE: Record<AnnouncementType, { chip: string; Icon: typeof Info }> = {
  INFO: { chip: "bg-sa-blue/15 text-sa-blue", Icon: Info },
  WARNING: { chip: "bg-sa-amber/15 text-sa-amber", Icon: AlertTriangle },
  MAINTENANCE: { chip: "bg-sa-purple/15 text-sa-purple", Icon: Wrench },
}

const WINDOW_LABEL: Record<AnnouncementRow["window"], { label: string; tone: string }> = {
  live: { label: "Showing now", tone: "text-sa-green" },
  scheduled: { label: "Scheduled", tone: "text-sa-blue" },
  ended: { label: "Ended", tone: "text-sa-dim" },
  off: { label: "Deactivated", tone: "text-sa-dim" },
}

const EMPTY = {
  title: "",
  body: "",
  type: "INFO" as AnnouncementType,
  startsAt: "",
  endsAt: "",
  targetPlans: [] as string[],
  dismissible: true,
}

export function AnnouncementsManager({ initial }: { initial: AnnouncementRow[] }) {
  const router = useRouter()
  const [rows, setRows] = React.useState(initial)
  const [creating, setCreating] = React.useState(false)
  const [draft, setDraft] = React.useState(EMPTY)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => setRows(initial), [initial])

  async function reload() {
    const response = await fetch("/api/config/announcements")
    if (response.ok) {
      setRows(((await response.json()) as { announcements: AnnouncementRow[] }).announcements)
    }
    router.refresh()
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/config/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          startsAt: draft.startsAt || new Date().toISOString(),
          endsAt: draft.endsAt || null,
        }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not create the announcement.")
      setDraft(EMPTY)
      setCreating(false)
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  async function toggle(row: AnnouncementRow) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/config/announcements/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not update.")
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  const live = rows.filter((row) => row.window === "live")

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-2xl text-body text-sa-muted">
          A persistent banner inside school dashboards, unlike a broadcast, which writes one
          notification and is done. {live.length} showing now.
        </p>
        <button
          type="button"
          onClick={() => setCreating((open) => !open)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {creating ? "Cancel" : "New announcement"}
        </button>
      </div>

      {error && <p className="text-body text-sa-red">{error}</p>}

      {creating && (
        <form onSubmit={create} className="grid gap-3 rounded-lg border border-sa-border bg-sa-surface p-4 sm:grid-cols-2">
          <label className="text-caption uppercase tracking-wide text-sa-dim sm:col-span-2">
            Title
            <input
              required
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim sm:col-span-2">
            Body
            <textarea
              required
              rows={3}
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              className="mt-1 w-full resize-none rounded-md border border-sa-border bg-sa-raised px-2.5 py-2 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Type
            <select
              value={draft.type}
              onChange={(event) => setDraft({ ...draft, type: event.target.value as AnnouncementType })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            >
              <option value="INFO">Info</option>
              <option value="WARNING">Warning</option>
              <option value="MAINTENANCE">Maintenance</option>
            </select>
          </label>

          <label className="flex items-end gap-2 text-caption text-sa-muted">
            <input
              type="checkbox"
              checked={draft.dismissible}
              onChange={(event) => setDraft({ ...draft, dismissible: event.target.checked })}
              className="mb-1.5 h-3.5 w-3.5 rounded border-sa-border bg-sa-raised"
            />
            <span className="mb-1">Schools can dismiss it</span>
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Starts
            <input
              type="datetime-local"
              value={draft.startsAt}
              onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Ends {draft.type === "MAINTENANCE" && <span className="text-sa-amber">(required)</span>}
            <input
              type="datetime-local"
              required={draft.type === "MAINTENANCE"}
              value={draft.endsAt}
              onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>

          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-caption uppercase tracking-wide text-sa-dim">
              Target plans (none = every school)
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {PLANS.map((plan) => {
                const on = draft.targetPlans.includes(plan)
                return (
                  <button
                    key={plan}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        targetPlans: on
                          ? draft.targetPlans.filter((entry) => entry !== plan)
                          : [...draft.targetPlans, plan],
                      })
                    }
                    className={cn(
                      "h-7 rounded-full border px-2.5 text-caption capitalize transition-colors",
                      on ? "border-sa-blue bg-sa-blue/15 text-sa-text" : "border-sa-border text-sa-dim hover:text-sa-text",
                    )}
                  >
                    {plan.toLowerCase()}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="h-8 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Publish"}
            </button>
            <p className="mt-1.5 text-caption text-sa-dim">
              A maintenance notice must have an end date — it would otherwise stay on every
              dashboard until somebody remembered to remove it.
            </p>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-sa-border bg-sa-surface px-4 py-10 text-center text-body text-sa-muted">
          No announcements yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const style = TYPE_STYLE[row.type]
            const state = WINDOW_LABEL[row.window]
            return (
              <li
                key={row.id}
                className={cn(
                  "rounded-lg border bg-sa-surface p-3",
                  row.window === "live" ? "border-sa-border" : "border-sa-border/60 opacity-70",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex h-5 items-center gap-1 rounded px-2 text-caption font-medium capitalize",
                          style.chip,
                        )}
                      >
                        <style.Icon className="h-3 w-3" aria-hidden="true" />
                        {row.type.toLowerCase()}
                      </span>
                      <span className="text-body text-sa-text">{row.title}</span>
                      <span className={cn("text-caption", state.tone)}>{state.label}</span>
                      {!row.dismissible && (
                        <span className="rounded border border-sa-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sa-dim">
                          not dismissible
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-body text-sa-muted">{row.body}</p>
                    <p className="mt-1 text-caption text-sa-dim">
                      {new Date(row.startsAt).toLocaleString("en-GB")} –{" "}
                      {row.endsAt ? new Date(row.endsAt).toLocaleString("en-GB") : "no end date"} ·{" "}
                      {row.targetPlans.length === 0
                        ? "every plan"
                        : row.targetPlans.map((plan) => plan.toLowerCase()).join(", ")}{" "}
                      · reaches {formatNumber(row.reach)} school{row.reach === 1 ? "" : "s"} · by{" "}
                      {row.createdBy}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggle(row)}
                    className={cn(
                      "h-7 shrink-0 rounded-md border px-2.5 text-caption transition-colors disabled:opacity-50",
                      row.isActive
                        ? "border-sa-border text-sa-muted hover:border-sa-red hover:text-sa-red"
                        : "border-sa-green/50 text-sa-green hover:bg-sa-green/10",
                    )}
                  >
                    {row.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
