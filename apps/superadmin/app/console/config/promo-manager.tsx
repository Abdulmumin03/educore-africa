"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { Plus, Trash2 } from "lucide-react"

import { cn, formatCurrency, formatNumber } from "@/lib/utils"

export type PromoRow = {
  id: string
  code: string
  discountType: "PERCENT" | "FIXED"
  discountValue: number
  plans: string[]
  expiresAt: string | null
  maxUses: number | null
  usedCount: number
  isActive: boolean
  note: string | null
  createdAt: string
  status: "live" | "inactive" | "expired" | "exhausted"
}

const PLANS = ["STARTER", "GROWTH", "PROFESSIONAL", "ENTERPRISE", "GOVERNMENT"]

const STATUS_STYLE: Record<PromoRow["status"], string> = {
  live: "bg-sa-green/15 text-sa-green",
  inactive: "bg-sa-dim/15 text-sa-dim",
  expired: "bg-sa-amber/15 text-sa-amber",
  exhausted: "bg-sa-amber/15 text-sa-amber",
}

const EMPTY = {
  code: "",
  discountType: "PERCENT" as "PERCENT" | "FIXED",
  discountValue: 10,
  plans: [] as string[],
  expiresAt: "",
  maxUses: "",
  note: "",
}

export function PromoManager({ initial }: { initial: PromoRow[] }) {
  const router = useRouter()
  const [rows, setRows] = React.useState(initial)
  const [creating, setCreating] = React.useState(false)
  const [draft, setDraft] = React.useState(EMPTY)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  // Live check against the same validator signup uses.
  const [testPlan, setTestPlan] = React.useState("PROFESSIONAL")
  const [testCode, setTestCode] = React.useState("")
  const [testResult, setTestResult] = React.useState<string | null>(null)

  React.useEffect(() => setRows(initial), [initial])

  async function reload() {
    const response = await fetch("/api/config/promo-codes")
    if (response.ok) setRows(((await response.json()) as { codes: PromoRow[] }).codes)
    router.refresh()
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch("/api/config/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          expiresAt: draft.expiresAt || null,
          maxUses: draft.maxUses === "" ? null : Number(draft.maxUses),
        }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not create the code.")
      setDraft(EMPTY)
      setCreating(false)
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  async function deactivate(row: PromoRow) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/config/promo-codes/${row.id}`, { method: "DELETE" })
      const body = (await response.json()) as { error?: string; notice?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not remove the code.")
      setNotice(body.notice ?? null)
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setTestResult(null)
    const response = await fetch("/api/config/promo-codes/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: testCode, plan: testPlan, cycle: "TERMLY" }),
    })
    const body = (await response.json()) as {
      ok?: boolean
      message?: string
      amountOff?: number
      finalAmount?: number
      listPrice?: number
      error?: string
    }
    if (body.error) {
      setTestResult(body.error)
      return
    }
    setTestResult(
      body.ok
        ? `Valid — ${formatCurrency(body.amountOff ?? 0)} off ${formatCurrency(body.listPrice ?? 0)}, leaving ${formatCurrency(body.finalAmount ?? 0)}.`
        : (body.message ?? "Rejected."),
    )
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-body text-sa-red">{error}</p>}
      {notice && <p className="text-body text-sa-amber">{notice}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating((open) => !open)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {creating ? "Cancel" : "New code"}
        </button>
      </div>

      {creating && (
        <form onSubmit={create} className="grid gap-3 rounded-lg border border-sa-border bg-sa-surface p-4 sm:grid-cols-3">
          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Code
            <input
              required
              value={draft.code}
              onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })}
              placeholder="TERM1-2026"
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 font-mono text-body normal-case tracking-normal text-sa-text placeholder:text-sa-disabled focus:border-sa-blue focus:outline-none"
            />
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Discount type
            <select
              value={draft.discountType}
              onChange={(event) =>
                setDraft({ ...draft, discountType: event.target.value as "PERCENT" | "FIXED" })
              }
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            >
              <option value="PERCENT">Percentage</option>
              <option value="FIXED">Fixed naira</option>
            </select>
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim">
            {draft.discountType === "PERCENT" ? "Percent off" : "Naira off"}
            <input
              required
              type="number"
              min={1}
              max={draft.discountType === "PERCENT" ? 100 : undefined}
              value={draft.discountValue}
              onChange={(event) => setDraft({ ...draft, discountValue: Number(event.target.value) })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 font-mono text-body tabular-nums text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Expires
            <input
              type="date"
              value={draft.expiresAt}
              onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Max uses (blank = unlimited)
            <input
              type="number"
              min={1}
              value={draft.maxUses}
              onChange={(event) => setDraft({ ...draft, maxUses: event.target.value })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 font-mono text-body tabular-nums text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Note
            <input
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>

          <fieldset className="sm:col-span-3">
            <legend className="mb-1.5 text-caption uppercase tracking-wide text-sa-dim">
              Applies to (none selected = every plan)
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {PLANS.map((plan) => {
                const on = draft.plans.includes(plan)
                return (
                  <button
                    key={plan}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        plans: on ? draft.plans.filter((entry) => entry !== plan) : [...draft.plans, plan],
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

          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={busy}
              className="h-8 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create code"}
            </button>
          </div>
        </form>
      )}

      <section className="rounded-lg border border-sa-border bg-sa-surface">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-body text-sa-muted">No promo codes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Code
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Discount
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Plans
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Uses
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Expires
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Status
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
                      <span className="font-mono text-body text-sa-text">{row.code}</span>
                      {row.note && <p className="text-caption text-sa-dim">{row.note}</p>}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-sa-muted">
                      {row.discountType === "PERCENT"
                        ? `${row.discountValue}%`
                        : formatCurrency(row.discountValue)}
                    </td>
                    <td className="px-3 py-2 text-caption text-sa-muted">
                      {row.plans.length === 0
                        ? "Every plan"
                        : row.plans.map((plan) => plan.toLowerCase()).join(", ")}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-sa-muted">
                      {formatNumber(row.usedCount)}
                      {row.maxUses !== null && (
                        <span className="text-sa-dim"> / {formatNumber(row.maxUses)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-caption tabular-nums text-sa-dim">
                      {row.expiresAt ? new Date(row.expiresAt).toLocaleDateString("en-GB") : "never"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex h-5 items-center rounded px-2 text-caption font-medium capitalize",
                          STATUS_STYLE[row.status],
                        )}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        disabled={busy || !row.isActive}
                        onClick={() => void deactivate(row)}
                        title={row.isActive ? "Deactivate or delete" : "Already inactive"}
                        className="rounded p-1 text-sa-dim transition-colors hover:bg-sa-raised hover:text-sa-red disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">Deactivate {row.code}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-sa-border bg-sa-surface p-4">
        <h3 className="text-h3">Check a code</h3>
        <p className="mb-2 text-caption text-sa-dim">
          Runs the same validator school signup runs, against catalogue pricing.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={testCode}
            onChange={(event) => setTestCode(event.target.value.toUpperCase())}
            placeholder="CODE"
            className="h-8 w-40 rounded-md border border-sa-border bg-sa-raised px-2.5 font-mono text-body text-sa-text placeholder:text-sa-disabled focus:border-sa-blue focus:outline-none"
          />
          <select
            value={testPlan}
            onChange={(event) => setTestPlan(event.target.value)}
            aria-label="Plan to check against"
            className="h-8 rounded-md border border-sa-border bg-sa-raised px-2 text-body capitalize text-sa-text focus:border-sa-blue focus:outline-none"
          >
            {PLANS.map((plan) => (
              <option key={plan} value={plan}>
                {plan.toLowerCase()}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void test()}
            disabled={!testCode}
            className="h-8 rounded-md border border-sa-border px-3 text-body text-sa-muted transition-colors hover:text-sa-text disabled:opacity-40"
          >
            Check
          </button>
          {testResult && <span className="text-body text-sa-muted">{testResult}</span>}
        </div>
      </section>
    </div>
  )
}
