"use client"

import * as React from "react"
import { ChevronDown, Loader2, RefreshCw, Sparkles } from "lucide-react"

import { ForecastChart, type ForecastBar } from "@/components/charts/forecast-chart"
import { cn, formatCurrency } from "@/lib/utils"

type Scenario = { base: number; optimistic: number; pessimistic: number }
type Payload = {
  forecast: {
    month1: Scenario
    month2: Scenario
    month3: Scenario
    assumptions: string[]
    risks: string[]
  }
  source: "model" | "arithmetic"
  model: string | null
  inputs: {
    mrr: number
    growthPercent: number
    churnPercent: number
    trials: number
    conversionPercent: number
  }
  generatedAt: string
  cached: boolean
}

function monthLabels(): string[] {
  const now = new Date()
  return [1, 2, 3].map((offset) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }),
  )
}

/**
 * Collapsible, and it does NOT fetch until opened — the model call is
 * expensive enough that loading it behind a closed panel on every dashboard
 * render would be wasteful.
 */
export function ForecastPanel() {
  const [open, setOpen] = React.useState(false)
  const [data, setData] = React.useState<Payload | null>(null)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async (refresh = false) => {
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/ai/revenue-forecast${refresh ? "?refresh=1" : ""}`, {
        method: "POST",
      })
      if (!response.ok) {
        setError("Could not generate the forecast.")
        return
      }
      setData((await response.json()) as Payload)
    } catch {
      setError("Could not reach the server.")
    } finally {
      setPending(false)
    }
  }, [])

  React.useEffect(() => {
    if (open && !data && !pending) void load()
  }, [open, data, pending, load])

  const labels = monthLabels()
  const bars: ForecastBar[] = data
    ? [data.forecast.month1, data.forecast.month2, data.forecast.month3].map((scenario, index) => ({
        month: labels[index],
        pessimistic: scenario.pessimistic,
        base: scenario.base,
        optimistic: scenario.optimistic,
      }))
    : []

  return (
    <div
      className="rounded-[9px] p-px"
      style={{
        background:
          "linear-gradient(110deg, #8B5CF6 0%, rgba(139,92,246,0.35) 38%, rgba(59,130,246,0.35) 68%, #8B5CF6 100%)",
      }}
    >
      <div className="rounded-lg bg-sa-surface">
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          aria-expanded={open}
          className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-sa-purple" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sa-purple">
            EduCore Intelligence — 3-month revenue forecast
          </span>
          {data && (
            <span className="text-caption text-sa-dim">
              · base {formatCurrency(data.forecast.month3.base)} by {labels[2]}
              {data.source === "arithmetic" && " · rule-based"}
            </span>
          )}
          <ChevronDown
            className={cn("ml-auto h-4 w-4 shrink-0 text-sa-muted transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>

        {open && (
          <div className="border-t border-sa-border px-4 py-4">
            {pending && !data && (
              <div className="flex items-center justify-center gap-2 py-10 text-body text-sa-dim">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Generating forecast…
              </div>
            )}

            {error && <p className="py-4 text-body text-sa-red">{error}</p>}

            {data && (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-sa-dim">
                  <span>
                    From MRR <span className="tabular text-sa-muted">{formatCurrency(data.inputs.mrr)}</span>
                  </span>
                  <span>
                    growth{" "}
                    <span className="tabular text-sa-muted">{data.inputs.growthPercent.toFixed(2)}%</span>
                  </span>
                  <span>
                    churn <span className="tabular text-sa-muted">{data.inputs.churnPercent.toFixed(2)}%</span>
                  </span>
                  <span>
                    <span className="tabular text-sa-muted">{data.inputs.trials}</span> trials at{" "}
                    <span className="tabular text-sa-muted">{data.inputs.conversionPercent.toFixed(0)}%</span>
                  </span>
                  {data.source === "arithmetic" && (
                    <span className="rounded bg-sa-amber/15 px-2 py-0.5 text-sa-amber">
                      Rule-based projection — no ANTHROPIC_API_KEY set
                    </span>
                  )}
                  {data.source === "model" && data.model && (
                    <span className="rounded bg-sa-purple/15 px-2 py-0.5 text-sa-purple">{data.model}</span>
                  )}
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="overflow-hidden rounded-md border border-sa-border">
                    <div className="grid grid-cols-4 items-center gap-2 border-b border-sa-border bg-sa-base/40 px-3 py-2">
                      {["Month", "Pessimistic", "Base", "Optimistic"].map((head, index) => (
                        <span
                          key={head}
                          className={cn(
                            "text-[11px] font-semibold uppercase tracking-wider text-sa-dim",
                            index > 0 && "text-right",
                          )}
                        >
                          {head}
                        </span>
                      ))}
                    </div>
                    {bars.map((row) => (
                      <div
                        key={row.month}
                        className="grid grid-cols-4 items-center gap-2 border-b border-sa-border px-3 py-2 last:border-b-0"
                      >
                        <span className="tabular">{row.month}</span>
                        <span className="tabular text-right text-sa-muted">
                          {formatCurrency(row.pessimistic)}
                        </span>
                        <span className="tabular text-right font-medium text-sa-purple">
                          {formatCurrency(row.base)}
                        </span>
                        <span className="tabular text-right text-sa-green">
                          {formatCurrency(row.optimistic)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-md border border-sa-border p-2">
                    <ForecastChart data={bars} />
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">
                      Assumptions
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {data.forecast.assumptions.map((item, index) => (
                        <li key={index} className="text-body text-sa-muted">
                          · {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">Risks</p>
                    <ul className="mt-1.5 space-y-1">
                      {data.forecast.risks.map((item, index) => (
                        <li key={index} className="text-body text-sa-amber/90">
                          · {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void load(true)}
                    disabled={pending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sa-purple/40 bg-sa-purple/15 px-3 text-body font-medium text-sa-purple transition-colors hover:bg-sa-purple/25 disabled:opacity-60"
                  >
                    {pending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Regenerate
                  </button>
                  <span className="text-caption text-sa-dim">
                    Cached 24h · generated{" "}
                    <span className="tabular">
                      {new Date(data.generatedAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
