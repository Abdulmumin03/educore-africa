"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { Plus, Trash2 } from "lucide-react"

import { cn, formatNumber } from "@/lib/utils"

type Scope = "GLOBAL" | "BY_PLAN" | "BY_SCHOOL" | "BY_STATE"

export type FlagRow = {
  id: string
  key: string
  label: string
  description: string | null
  enabled: boolean
  defaultValue: boolean
  rollout: number
  scope: Scope
  scopeValues: string[]
  reach: { matched: number; total: number }
  updatedAt: string | null
}

const SCOPES: Array<{ value: Scope; label: string; hint: string }> = [
  { value: "GLOBAL", label: "Global", hint: "Every school" },
  { value: "BY_PLAN", label: "By plan", hint: "Plan tiers, comma separated" },
  { value: "BY_SCHOOL", label: "By school", hint: "School ids, comma separated" },
  { value: "BY_STATE", label: "By state", hint: "State names, comma separated" },
]

const EMPTY = {
  key: "",
  label: "",
  description: "",
  scope: "GLOBAL" as Scope,
  scopeValues: "",
  rollout: 100,
  enabled: false,
}

export function FlagsManager({ initial }: { initial: FlagRow[] }) {
  const router = useRouter()
  const [rows, setRows] = React.useState(initial)
  const [creating, setCreating] = React.useState(false)
  const [draft, setDraft] = React.useState(EMPTY)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => setRows(initial), [initial])

  async function reload() {
    const response = await fetch("/api/system/feature-flags")
    if (response.ok) setRows(((await response.json()) as { flags: FlagRow[] }).flags)
    router.refresh()
  }

  async function save(id: string, patch: Record<string, unknown>) {
    setBusyId(id)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/system/feature-flags/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not save the flag.")
      // The write clears the Redis cache before responding, so the flag is
      // already live by the time this resolves.
      setNotice("Saved. The flag is live now — the read cache is cleared on write, not on a timer.")
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusyId(null)
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusyId("new")
    setError(null)
    try {
      const response = await fetch("/api/system/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          scopeValues: draft.scopeValues
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not create the flag.")
      setDraft(EMPTY)
      setCreating(false)
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusyId(null)
    }
  }

  async function remove(row: FlagRow) {
    setBusyId(row.id)
    setError(null)
    try {
      const response = await fetch(`/api/system/feature-flags/${row.id}`, { method: "DELETE" })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not delete the flag.")
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-body text-sa-red">{error}</p>}
      {notice && <p className="text-body text-sa-green">{notice}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating((open) => !open)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {creating ? "Cancel" : "New flag"}
        </button>
      </div>

      {creating && (
        <form onSubmit={create} className="grid gap-3 rounded-lg border border-sa-border bg-sa-surface p-4 sm:grid-cols-2">
          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Key (snake_case, permanent)
            <input
              required
              value={draft.key}
              onChange={(event) => setDraft({ ...draft, key: event.target.value })}
              placeholder="new_report_designer"
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 font-mono text-body normal-case tracking-normal text-sa-text placeholder:text-sa-disabled focus:border-sa-blue focus:outline-none"
            />
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Label
            <input
              required
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim sm:col-span-2">
            Description
            <input
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Scope
            <select
              value={draft.scope}
              onChange={(event) => setDraft({ ...draft, scope: event.target.value as Scope })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            >
              {SCOPES.map((scope) => (
                <option key={scope.value} value={scope.value}>
                  {scope.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Rollout %
            <input
              type="number"
              min={0}
              max={100}
              value={draft.rollout}
              onChange={(event) => setDraft({ ...draft, rollout: Number(event.target.value) })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 font-mono text-body tabular-nums text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>

          {draft.scope !== "GLOBAL" && (
            <label className="text-caption uppercase tracking-wide text-sa-dim sm:col-span-2">
              {SCOPES.find((scope) => scope.value === draft.scope)?.hint}
              <input
                value={draft.scopeValues}
                onChange={(event) => setDraft({ ...draft, scopeValues: event.target.value })}
                className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 font-mono text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
              />
            </label>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busyId === "new"}
              className="h-8 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:opacity-50"
            >
              {busyId === "new" ? "Creating…" : "Create flag"}
            </button>
            <p className="mt-1.5 text-caption text-sa-dim">
              New flags start disabled. The key cannot be changed afterwards — code reads it by name.
            </p>
          </div>
        </form>
      )}

      <section className="rounded-lg border border-sa-border bg-sa-surface">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-body text-sa-muted">No feature flags yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Flag
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Rollout
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Scoped to
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Reaches
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-sa-border/60 last:border-0">
                    <td className="px-4 py-2">
                      <p className="text-sa-text">{row.label}</p>
                      <p className="font-mono text-caption text-sa-dim">{row.key}</p>
                      {row.description && (
                        <p className="mt-0.5 max-w-md text-caption text-sa-dim">{row.description}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={row.enabled}
                        aria-label={`${row.enabled ? "Disable" : "Enable"} ${row.label}`}
                        disabled={busyId === row.id}
                        onClick={() => void save(row.id, { enabled: !row.enabled })}
                        className={cn(
                          "inline-flex h-5 w-9 items-center rounded-full border transition-colors disabled:opacity-50",
                          row.enabled ? "border-sa-green bg-sa-green/25" : "border-sa-border bg-sa-raised",
                        )}
                      >
                        <span
                          className={cn(
                            "mx-0.5 h-3.5 w-3.5 rounded-full transition-transform",
                            row.enabled ? "translate-x-4 bg-sa-green" : "bg-sa-dim",
                          )}
                        />
                      </button>
                      <span className={cn("ml-2 text-caption", row.enabled ? "text-sa-green" : "text-sa-dim")}>
                        {row.enabled ? "On" : "Off"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={row.rollout}
                        disabled={busyId === row.id}
                        onBlur={(event) => {
                          const value = Number(event.target.value)
                          if (value !== row.rollout) void save(row.id, { rollout: value })
                        }}
                        className="h-7 w-16 rounded border border-sa-border bg-sa-raised px-1.5 font-mono text-body tabular-nums text-sa-text focus:border-sa-blue focus:outline-none"
                      />
                      <span className="ml-1 text-caption text-sa-dim">%</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-caption text-sa-muted">
                        {row.scope === "GLOBAL"
                          ? "Every school"
                          : `${SCOPES.find((scope) => scope.value === row.scope)?.label}: ${row.scopeValues.join(", ")}`}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="font-mono text-body tabular-nums text-sa-text">
                        {formatNumber(row.reach.matched)}
                      </span>
                      <span className="text-caption text-sa-dim"> / {formatNumber(row.reach.total)}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        disabled={busyId === row.id || row.enabled}
                        title={row.enabled ? "Disable the flag before deleting it" : "Delete"}
                        onClick={() => void remove(row)}
                        className="rounded p-1 text-sa-dim transition-colors hover:bg-sa-raised hover:text-sa-red disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">Delete {row.label}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-caption text-sa-dim">
        A partial rollout buckets each school by a hash of (flag key, school id), so a school stays
        on the same side of the split across requests and restarts. Without a school in context —
        a platform-wide job, say — a partial rollout resolves to the default rather than flipping
        per call.
      </p>
    </div>
  )
}
