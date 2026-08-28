"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { Sparkles } from "lucide-react"

import { cn, formatNumber } from "@/lib/utils"

type Signals = {
  modulesUsed: number
  students: number
  teamSize: number
  activeDays: number
  trialAge: number
}

export type TrialRow = {
  schoolId: string
  school: string
  state: string | null
  plan: string
  startedAt: string
  trialEndsAt: string | null
  daysRemaining: number | null
  signals: Signals
  score: number
  band: "hot" | "warm" | "cool" | "cold"
  lastLoginAt: string | null
}

type Advice = {
  headline: string
  nextSteps: string[]
  weakest: string
  generated: boolean
  note?: string
}

const BAND_STYLE: Record<TrialRow["band"], { bar: string; text: string }> = {
  hot: { bar: "bg-sa-green", text: "text-sa-green" },
  warm: { bar: "bg-sa-teal", text: "text-sa-teal" },
  cool: { bar: "bg-sa-amber", text: "text-sa-amber" },
  cold: { bar: "bg-sa-red", text: "text-sa-red" },
}

export function TrialsTable({
  trials,
  summary,
}: {
  trials: TrialRow[]
  summary: { total: number; hot: number; expiringWeek: number; lapsed: number }
}) {
  const router = useRouter()
  const [advice, setAdvice] = React.useState<Record<string, Advice>>({})
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  async function score(schoolId: string) {
    setBusy(schoolId)
    setError(null)
    try {
      const response = await fetch("/api/ai/trial-conversion-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId }),
      })
      const body = (await response.json()) as Advice & { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not score the trial.")
      setAdvice((current) => ({ ...current, [schoolId]: body }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(null)
    }
  }

  async function act(schoolId: string, action: string) {
    let payload: Record<string, unknown> = { action }

    if (action === "extend") {
      const days = window.prompt("Extend the trial by how many days?", "14")
      if (!days) return
      payload = { action, days: Number(days) }
    }
    if (action === "lost") {
      const reason = window.prompt("Why was this trial lost?")
      if (!reason) return
      payload = { action, reason }
    }
    if (action === "convert" && !window.confirm("Convert this trial to a paid subscription?")) return

    setBusy(schoolId)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/growth/trials/${schoolId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = (await response.json()) as Record<string, unknown> & { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not complete the action.")
      setNotice(
        (body.notice as string) ??
          (action === "extend"
            ? `Trial extended to ${new Date(body.trialEndsAt as string).toLocaleDateString("en-GB")}.`
            : "Done."),
      )
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Trials running", value: summary.total, tone: "text-sa-text" },
          { label: "Likely to convert", value: summary.hot, tone: "text-sa-green" },
          {
            label: "Ending this week",
            value: summary.expiringWeek,
            tone: summary.expiringWeek > 0 ? "text-sa-amber" : "text-sa-dim",
          },
          {
            label: "Already lapsed",
            value: summary.lapsed,
            tone: summary.lapsed > 0 ? "text-sa-red" : "text-sa-dim",
          },
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
      {notice && <p className="text-body text-sa-green">{notice}</p>}

      <section className="rounded-lg border border-sa-border bg-sa-surface">
        {trials.length === 0 ? (
          <p className="px-4 py-10 text-center text-body text-sa-muted">No schools are on trial.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    School
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Days left
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Activity
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Likelihood
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {trials.map((trial) => {
                  const style = BAND_STYLE[trial.band]
                  const detail = advice[trial.schoolId]
                  return (
                    <React.Fragment key={trial.schoolId}>
                      <tr className="border-b border-sa-border/60 last:border-0">
                        <td className="px-4 py-2">
                          <Link
                            href={`/console/schools/${trial.schoolId}`}
                            className="text-sa-text hover:text-sa-blue"
                          >
                            {trial.school}
                          </Link>
                          <p className="text-caption text-sa-dim">
                            {trial.state ?? "state unknown"} · {trial.plan.toLowerCase()} ·{" "}
                            {trial.lastLoginAt
                              ? `last login ${new Date(trial.lastLoginAt).toLocaleDateString("en-GB")}`
                              : "never signed in"}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={cn(
                              "font-mono tabular-nums",
                              trial.daysRemaining === null
                                ? "text-sa-disabled"
                                : trial.daysRemaining < 0
                                  ? "text-sa-red"
                                  : trial.daysRemaining <= 7
                                    ? "text-sa-amber"
                                    : "text-sa-muted",
                            )}
                          >
                            {trial.daysRemaining === null
                              ? "no end date"
                              : trial.daysRemaining < 0
                                ? `${Math.abs(trial.daysRemaining)}d over`
                                : `${trial.daysRemaining}d`}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex flex-wrap gap-x-3 text-caption text-sa-muted">
                            <span title="Modules with any activity">
                              {trial.signals.modulesUsed} module
                              {trial.signals.modulesUsed === 1 ? "" : "s"}
                            </span>
                            <span>{formatNumber(trial.signals.students)} students</span>
                            <span>
                              {trial.signals.teamSize} staff account
                              {trial.signals.teamSize === 1 ? "" : "s"}
                            </span>
                            <span>
                              {trial.signals.activeDays}/{trial.signals.trialAge} days active
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-sa-raised">
                              <div
                                className={cn("h-1.5 rounded-full", style.bar)}
                                style={{ width: `${Math.max(2, trial.score)}%` }}
                              />
                            </div>
                            <span className={cn("font-mono text-caption tabular-nums", style.text)}>
                              {trial.score}
                            </span>
                            <span className="text-caption capitalize text-sa-dim">{trial.band}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={busy === trial.schoolId}
                              onClick={() => void score(trial.schoolId)}
                              title="Explain this score"
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-sa-border px-2 text-caption text-sa-muted transition-colors hover:border-sa-purple hover:text-sa-purple disabled:opacity-50"
                            >
                              <Sparkles className="h-3 w-3" aria-hidden="true" />
                              Why
                            </button>
                            {[
                              { action: "extend", label: "Extend" },
                              { action: "nudge", label: "Nudge" },
                              { action: "convert", label: "Convert" },
                              { action: "lost", label: "Lost" },
                            ].map((option) => (
                              <button
                                key={option.action}
                                type="button"
                                disabled={busy === trial.schoolId}
                                onClick={() => void act(trial.schoolId, option.action)}
                                className={cn(
                                  "h-7 rounded-md border px-2 text-caption transition-colors disabled:opacity-50",
                                  option.action === "convert"
                                    ? "border-sa-green/50 text-sa-green hover:bg-sa-green/10"
                                    : option.action === "lost"
                                      ? "border-sa-border text-sa-dim hover:border-sa-red hover:text-sa-red"
                                      : "border-sa-border text-sa-muted hover:text-sa-text",
                                )}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>

                      {detail && (
                        <tr className="border-b border-sa-border/60 bg-sa-raised/30">
                          <td colSpan={5} className="px-4 py-2.5">
                            <div className="flex items-start gap-2">
                              <span
                                className={cn(
                                  "mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                                  detail.generated
                                    ? "border-sa-purple/40 bg-sa-purple/10 text-sa-purple"
                                    : "border-sa-border text-sa-dim",
                                )}
                              >
                                {detail.generated ? "Claude" : "Computed"}
                              </span>
                              <div>
                                <p className="text-body text-sa-text">{detail.headline}</p>
                                {detail.nextSteps.length > 0 && (
                                  <ul className="mt-1 space-y-0.5">
                                    {detail.nextSteps.map((step) => (
                                      <li key={step} className="flex gap-2 text-caption text-sa-muted">
                                        <span aria-hidden="true" className="text-sa-dim">
                                          &rarr;
                                        </span>
                                        {step}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {detail.note && (
                                  <p className="mt-1 text-caption text-sa-dim">{detail.note}</p>
                                )}
                              </div>
                            </div>
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

        <p className="border-t border-sa-border px-4 py-2 text-caption text-sa-dim">
          The likelihood score is arithmetic over four observed signals — students on the roll (35),
          colleagues invited (25), modules explored (25) and days active (15) — so it is
          reproducible and can be argued with. Claude is only asked to explain it, never to
          produce it.
        </p>
      </section>
    </div>
  )
}
