"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react"

import { ChurnBadge, type ChurnLevel } from "@/components/shared/churn-badge"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"

type Signals = {
  daysSinceLogin: number
  modulesUsed: number
  recentTickets: number
  daysOverdue: number
  mrr: number
  students: number
}

export type ChurnRow = {
  schoolId: string
  school: string
  state: string | null
  level: ChurnLevel
  score: number
  primaryReason: string
  recommendedAction: string
  signals: Signals
  generated: boolean
  computedAt: string
  delta: number | null
}

export function ChurnTable({
  initial,
  byLevel,
  mrrAtRisk,
  computedAt,
  canRun,
}: {
  initial: ChurnRow[]
  byLevel: Record<string, number>
  mrrAtRisk: number
  computedAt: string | null
  canRun: boolean
}) {
  const router = useRouter()
  const [rows, setRows] = React.useState(initial)
  const [level, setLevel] = React.useState<string>("ALL")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => setRows(initial), [initial])

  async function rescore() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch("/api/ai/churn-risk", { method: "POST" })
      const body = (await response.json()) as {
        scored?: number
        narrated?: number
        notice?: string
        error?: string
      }
      if (!response.ok) throw new Error(body.error ?? "Scoring failed.")
      setNotice(
        `Scored ${formatNumber(body.scored ?? 0)} schools${body.narrated ? `, ${body.narrated} narrated by Claude` : ""}. ${body.notice ?? ""}`.trim(),
      )
      const refreshed = await fetch("/api/ai/churn-risk")
      if (refreshed.ok) setRows(((await refreshed.json()) as { scores: ChurnRow[] }).scores)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  const visible = level === "ALL" ? rows : rows.filter((row) => row.level === level)

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Critical", value: byLevel.CRITICAL ?? 0, tone: (byLevel.CRITICAL ?? 0) > 0 ? "text-sa-red" : "text-sa-dim" },
          { label: "High", value: byLevel.HIGH ?? 0, tone: (byLevel.HIGH ?? 0) > 0 ? "text-sa-amber" : "text-sa-dim" },
          { label: "Medium", value: byLevel.MEDIUM ?? 0, tone: "text-sa-blue" },
          { label: "MRR at risk", value: mrrAtRisk, tone: "text-sa-text", currency: true },
        ].map((card) => (
          <section key={card.label} className="rounded-lg border border-sa-border bg-sa-surface p-4">
            <p className="text-caption uppercase tracking-wide text-sa-dim">{card.label}</p>
            <p className={cn("mt-1 font-mono text-display tabular-nums", card.tone)}>
              {card.currency ? formatCurrency(card.value) : formatNumber(card.value)}
            </p>
            {card.currency && (
              <p className="text-caption text-sa-dim">High and Critical only</p>
            )}
          </section>
        ))}
      </div>

      {error && <p className="text-body text-sa-red">{error}</p>}
      {notice && <p className="text-body text-sa-green">{notice}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={level === option}
              onClick={() => setLevel(option)}
              className={cn(
                "h-7 rounded-full border px-2.5 text-caption capitalize transition-colors",
                level === option
                  ? "border-sa-blue bg-sa-blue/15 text-sa-text"
                  : "border-sa-border text-sa-dim hover:text-sa-text",
              )}
            >
              {option.toLowerCase()}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-caption text-sa-dim">
            {computedAt ? `Scored ${new Date(computedAt).toLocaleString("en-GB")}` : "Never scored"}
          </span>
          {canRun && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void rescore()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sa-border px-3 text-body text-sa-muted transition-colors hover:text-sa-text disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} aria-hidden="true" />
              {busy ? "Scoring…" : "Re-score now"}
            </button>
          )}
        </div>
      </div>

      <section className="rounded-lg border border-sa-border bg-sa-surface">
        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-body text-sa-muted">
            {rows.length === 0
              ? "No school has been scored yet. Run the weekly batch to create the first set."
              : "No school is at that level."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="px-4 py-2 text-left font-medium">School</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Risk</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Why</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Signals</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">MRR</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.schoolId} className="border-b border-sa-border/60 last:border-0">
                    <td className="px-4 py-2">
                      <Link
                        href={`/console/schools/${row.schoolId}`}
                        className="text-sa-text hover:text-sa-blue"
                      >
                        {row.school}
                      </Link>
                      <p className="text-caption text-sa-dim">{row.state ?? "state unknown"}</p>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <ChurnBadge level={row.level} score={row.score} />
                        {row.delta !== null && row.delta !== 0 && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-0.5 font-mono text-caption tabular-nums",
                              row.delta > 0 ? "text-sa-red" : "text-sa-green",
                            )}
                            title="Change since the previous run"
                          >
                            {row.delta > 0 ? (
                              <ArrowUp className="h-3 w-3" aria-hidden="true" />
                            ) : (
                              <ArrowDown className="h-3 w-3" aria-hidden="true" />
                            )}
                            {Math.abs(row.delta)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-xs px-3 py-2">
                      <p className="text-caption text-sa-muted">{row.primaryReason}</p>
                      <p className="mt-0.5 flex gap-1.5 text-caption text-sa-dim">
                        <span aria-hidden="true">&rarr;</span>
                        {row.recommendedAction}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap gap-x-3 text-caption text-sa-dim">
                        <span title="Days since anybody signed in">
                          {row.signals.daysSinceLogin >= 900 ? "never" : `${row.signals.daysSinceLogin}d`} silent
                        </span>
                        <span>{row.signals.modulesUsed}/8 modules</span>
                        {row.signals.daysOverdue > 0 && (
                          <span className="text-sa-amber">{row.signals.daysOverdue}d overdue</span>
                        )}
                        {row.signals.recentTickets > 0 && <span>{row.signals.recentTickets} tickets</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-sa-text">
                      {formatCurrency(row.signals.mrr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="border-t border-sa-border px-4 py-2 text-caption text-sa-dim">
          The score is arithmetic over four observed signals — silence since last login (40),
          overdue payment (25), shallow module adoption (20) and recent tickets (15). Claude writes
          the reason and the action for the twenty-five worst; everything else carries a computed
          verdict, and each row says which.
        </p>
      </section>
    </div>
  )
}
