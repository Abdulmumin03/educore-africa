"use client"

import * as React from "react"
import { Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"

type Insights = {
  headline: string
  observations: string[]
  actions: string[]
  generated: boolean
  note?: string
}

/**
 * Cohort commentary.
 *
 * Deliberately not fetched on render: the model call costs money and the page
 * is often opened just to read the grid. The panel says whether Claude wrote
 * the lines or arithmetic did — a heuristic fallback dressed as AI would be
 * worse than no panel.
 */
export function RetentionInsights() {
  const [state, setState] = React.useState<"idle" | "loading" | "done" | "error">("idle")
  const [insights, setInsights] = React.useState<Insights | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function run() {
    setState("loading")
    setError(null)
    try {
      const response = await fetch("/api/ai/retention-insights", { method: "POST" })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Request failed (${response.status})`)
      }
      setInsights((await response.json()) as Insights)
      setState("done")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
      setState("error")
    }
  }

  return (
    <div>
      {state === "idle" && (
        <button
          type="button"
          onClick={run}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sa-border bg-sa-raised px-3 text-body text-sa-text transition-colors hover:border-sa-purple hover:text-sa-purple"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Read the cohort grid
        </button>
      )}

      {state === "loading" && (
        <p className="text-body text-sa-dim">Reading twelve cohorts&hellip;</p>
      )}

      {state === "error" && (
        <div className="space-y-2">
          <p className="text-body text-sa-red">{error}</p>
          <button
            type="button"
            onClick={run}
            className="text-caption text-sa-blue hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {state === "done" && insights && (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <span
              className={cn(
                "mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                insights.generated
                  ? "border-sa-purple/40 bg-sa-purple/10 text-sa-purple"
                  : "border-sa-border text-sa-dim",
              )}
            >
              {insights.generated ? "Claude" : "Computed"}
            </span>
            <p className="text-body font-medium text-sa-text">{insights.headline}</p>
          </div>

          {insights.observations.length > 0 && (
            <ul className="space-y-1.5">
              {insights.observations.map((line) => (
                <li key={line} className="flex gap-2 text-body text-sa-muted">
                  <span aria-hidden="true" className="text-sa-dim">
                    &bull;
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          )}

          {insights.actions.length > 0 && (
            <div>
              <p className="mb-1 text-caption uppercase tracking-wide text-sa-dim">Suggested actions</p>
              <ul className="space-y-1.5">
                {insights.actions.map((line) => (
                  <li key={line} className="flex gap-2 text-body text-sa-muted">
                    <span aria-hidden="true" className="text-sa-dim">
                      &rarr;
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {insights.note && <p className="text-caption text-sa-dim">{insights.note}</p>}
        </div>
      )}
    </div>
  )
}
