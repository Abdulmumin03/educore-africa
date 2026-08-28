"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { RefreshCw, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"

type Recommendation = {
  rank: number
  title: string
  rationale: string
  action: string
  impact: string
  effort: string
  basedOn: string[]
  generated: boolean
}

type Batch = {
  batchId: string
  generatedAt: string
  generated: boolean
  recommendations: Recommendation[]
  note?: string
}

const TONE: Record<string, string> = {
  HIGH: "bg-sa-green/15 text-sa-green",
  MEDIUM: "bg-sa-amber/15 text-sa-amber",
  LOW: "bg-sa-dim/15 text-sa-dim",
}

export function Opportunities({
  initial,
  ageDays,
  stale,
  canRun,
}: {
  initial: Batch | null
  ageDays: number | null
  stale: boolean
  canRun: boolean
}) {
  const router = useRouter()
  const [batch, setBatch] = React.useState(initial)
  const [age, setAge] = React.useState(ageDays)
  const [isStale, setIsStale] = React.useState(stale)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function regenerate() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/ai/growth-recommendations", { method: "POST" })
      const body = (await response.json()) as { batch?: Batch; error?: string }
      if (!response.ok || !body.batch) throw new Error(body.error ?? "Could not generate.")
      setBatch(body.batch)
      setAge(0)
      setIsStale(false)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-sa-border bg-sa-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-sa-border px-4 py-2.5">
        <div>
          <h2 className="text-h3">This week&rsquo;s opportunities</h2>
          <p className="text-caption text-sa-dim">
            {batch
              ? `Generated ${age === 0 ? "just now" : `${age} day${age === 1 ? "" : "s"} ago`} from the platform's own figures`
              : "Nothing generated yet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {batch && (
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                batch.generated
                  ? "border-sa-purple/40 bg-sa-purple/10 text-sa-purple"
                  : "border-sa-border text-sa-dim",
              )}
            >
              {batch.generated ? "Claude" : "Computed"}
            </span>
          )}
          {canRun && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void regenerate()}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-sa-border px-2.5 text-caption text-sa-muted transition-colors hover:border-sa-purple hover:text-sa-purple disabled:opacity-50"
            >
              {busy ? (
                <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-3 w-3" aria-hidden="true" />
              )}
              {busy ? "Working…" : "Regenerate"}
            </button>
          )}
        </div>
      </header>

      {isStale && (
        <p className="border-b border-sa-amber/30 bg-sa-amber/10 px-4 py-2 text-caption text-sa-amber">
          This batch is {age} days old, so it is not this week&rsquo;s picture. Regenerate before
          acting on it.
        </p>
      )}

      {error && <p className="px-4 py-2 text-body text-sa-red">{error}</p>}

      {!batch || batch.recommendations.length === 0 ? (
        <p className="px-4 py-8 text-center text-body text-sa-muted">
          No recommendations yet. {canRun ? "Generate the first batch above." : "A weekly batch will appear here."}
        </p>
      ) : (
        <ol className="divide-y divide-sa-border/60">
          {batch.recommendations.map((entry) => (
            <li key={entry.rank} className="flex gap-3 px-4 py-3">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sa-raised font-mono text-caption text-sa-muted">
                {entry.rank}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body font-medium text-sa-text">{entry.title}</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide", TONE[entry.impact] ?? TONE.MEDIUM)}>
                    {entry.impact} impact
                  </span>
                  <span className="rounded border border-sa-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sa-dim">
                    {entry.effort} effort
                  </span>
                </div>
                <p className="mt-0.5 text-body text-sa-muted">{entry.rationale}</p>
                <p className="mt-1 flex gap-2 text-caption text-sa-muted">
                  <span aria-hidden="true" className="text-sa-dim">&rarr;</span>
                  {entry.action}
                </p>
                {entry.basedOn.length > 0 && (
                  <p className="mt-1 font-mono text-[10px] text-sa-disabled">
                    from {entry.basedOn.join(", ")}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {batch?.note && (
        <p className="border-t border-sa-border px-4 py-2 text-caption text-sa-dim">{batch.note}</p>
      )}
    </section>
  )
}
