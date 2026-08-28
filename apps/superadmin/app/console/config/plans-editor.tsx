"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { AlertTriangle } from "lucide-react"

import { cn, formatCurrency, formatNumber } from "@/lib/utils"

export type PlanRow = {
  id: string
  plan: string
  label: string
  monthly: number
  termly: number
  annual: number
  maxStudents: number | null
  storageGb: number
  smsCredits: number
  modules: string[]
  isPublic: boolean
  existingSubscribers: number
}

const MODULES = [
  { key: "attendance", label: "Attendance" },
  { key: "grades", label: "Grades" },
  { key: "finance", label: "Finance" },
  { key: "communication", label: "Communication" },
  { key: "elearning", label: "E-Learning" },
  { key: "library", label: "Library" },
  { key: "hostel", label: "Hostel" },
  { key: "transport", label: "Transport" },
  { key: "ai_suite", label: "AI Suite" },
]

export function PlansEditor({ initial, notice }: { initial: PlanRow[]; notice: string }) {
  const router = useRouter()
  const [rows, setRows] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState<string | null>(null)

  const dirty = React.useMemo(
    () => JSON.stringify(rows) !== JSON.stringify(initial),
    [rows, initial],
  )

  function update(plan: string, patch: Partial<PlanRow>) {
    setRows((current) => current.map((row) => (row.plan === plan ? { ...row, ...patch } : row)))
    setSaved(null)
  }

  function toggleModule(plan: string, key: string) {
    setRows((current) =>
      current.map((row) =>
        row.plan === plan
          ? {
              ...row,
              modules: row.modules.includes(key)
                ? row.modules.filter((entry) => entry !== key)
                : [...row.modules, key],
            }
          : row,
      ),
    )
    setSaved(null)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/config/plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plans: rows }),
      })
      const body = (await response.json()) as { error?: string; changed?: number; notice?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not save.")
      setSaved(
        body.changed
          ? `Saved ${body.changed} plan${body.changed === 1 ? "" : "s"}. ${body.notice ?? ""}`
          : "Nothing differed from what was stored.",
      )
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setSaving(false)
    }
  }

  const affected = rows.reduce((sum, row) => sum + row.existingSubscribers, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-sa-amber/40 bg-sa-amber/5 p-3">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sa-amber" aria-hidden="true" />
        <p className="text-body text-sa-muted">
          {notice} {formatNumber(affected)} school
          {affected === 1 ? "" : "s"} are on a plan today and none of them will be re-priced by
          saving here.
        </p>
      </div>

      {error && <p className="text-body text-sa-red">{error}</p>}
      {saved && <p className="text-body text-sa-green">{saved}</p>}

      <div className="overflow-x-auto rounded-lg border border-sa-border bg-sa-surface">
        <table className="w-full border-collapse text-body">
          <thead>
            <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Plan
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Monthly ₦
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Termly ₦
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Annual ₦
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Max students
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Storage GB
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                SMS / month
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                On this plan
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.plan} className="border-b border-sa-border/60 last:border-0">
                <td className="px-4 py-2">
                  <input
                    value={row.label}
                    onChange={(event) => update(row.plan, { label: event.target.value })}
                    className="h-7 w-32 rounded border border-transparent bg-transparent px-1.5 text-body text-sa-text hover:border-sa-border focus:border-sa-blue focus:bg-sa-raised focus:outline-none"
                  />
                  <p className="px-1.5 font-mono text-caption text-sa-dim">{row.plan}</p>
                </td>
                {(["monthly", "termly", "annual"] as const).map((field) => (
                  <td key={field} className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={row[field]}
                      onChange={(event) => update(row.plan, { [field]: Number(event.target.value) })}
                      className="h-7 w-28 rounded border border-sa-border bg-sa-raised px-1.5 text-right font-mono text-body tabular-nums text-sa-text focus:border-sa-blue focus:outline-none"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min={0}
                    placeholder="∞"
                    value={row.maxStudents ?? ""}
                    onChange={(event) =>
                      update(row.plan, {
                        maxStudents: event.target.value === "" ? null : Number(event.target.value),
                      })
                    }
                    className="h-7 w-24 rounded border border-sa-border bg-sa-raised px-1.5 text-right font-mono text-body tabular-nums text-sa-text placeholder:text-sa-disabled focus:border-sa-blue focus:outline-none"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min={0}
                    value={row.storageGb}
                    onChange={(event) => update(row.plan, { storageGb: Number(event.target.value) })}
                    className="h-7 w-20 rounded border border-sa-border bg-sa-raised px-1.5 text-right font-mono text-body tabular-nums text-sa-text focus:border-sa-blue focus:outline-none"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={row.smsCredits}
                    onChange={(event) => update(row.plan, { smsCredits: Number(event.target.value) })}
                    className="h-7 w-24 rounded border border-sa-border bg-sa-raised px-1.5 text-right font-mono text-body tabular-nums text-sa-text focus:border-sa-blue focus:outline-none"
                  />
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-sa-muted">
                  {formatNumber(row.existingSubscribers)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <section key={row.plan} className="rounded-lg border border-sa-border bg-sa-surface p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-body font-medium text-sa-text">{row.label}</h3>
              <span className="font-mono text-caption tabular-nums text-sa-dim">
                {formatCurrency(row.termly)} / term
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MODULES.map((module) => {
                const on = row.modules.includes(module.key)
                return (
                  <button
                    key={module.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleModule(row.plan, module.key)}
                    className={cn(
                      "h-6 rounded-full border px-2 text-caption transition-colors",
                      on
                        ? "border-sa-teal bg-sa-teal/15 text-sa-teal"
                        : "border-sa-border text-sa-dim hover:text-sa-text",
                    )}
                  >
                    {module.label}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void save()}
          className="h-8 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setRows(initial)
              setSaved(null)
            }}
            className="text-caption text-sa-blue hover:underline"
          >
            Discard
          </button>
        )}
      </div>
    </div>
  )
}
