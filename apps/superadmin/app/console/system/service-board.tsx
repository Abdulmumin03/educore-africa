"use client"

import * as React from "react"
import { RefreshCw } from "lucide-react"

import { cn } from "@/lib/utils"

type ServiceState = "up" | "degraded" | "down" | "unknown"

type Service = {
  key: string
  label: string
  state: ServiceState
  responseMs: number | null
  detail: string
  at: string
  uptimePercent: number | null
  samples: number
}

type Payload = { services: Service[]; probedAt: string; stale: boolean }

const DOT: Record<ServiceState, string> = {
  up: "bg-sa-green",
  degraded: "bg-sa-amber",
  down: "bg-sa-red",
  // Grey, and never green: "not checked" must not read as healthy.
  unknown: "bg-sa-dim",
}

const LABEL: Record<ServiceState, string> = {
  up: "Operational",
  degraded: "Slow",
  down: "Down",
  unknown: "Not checked",
}

const TEXT: Record<ServiceState, string> = {
  up: "text-sa-green",
  degraded: "text-sa-amber",
  down: "text-sa-red",
  unknown: "text-sa-dim",
}

/**
 * Live status board.
 *
 * Fed by SSE rather than polling: a fifteen-minute tab would otherwise make
 * thirty requests to learn nothing changed. If the stream drops, the board
 * says so instead of quietly showing an hour-old snapshot as current.
 */
export function ServiceBoard({ initial }: { initial: Payload }) {
  const [data, setData] = React.useState(initial)
  const [connected, setConnected] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)

  React.useEffect(() => {
    const source = new EventSource("/api/system/services/stream")

    source.addEventListener("status", (event) => {
      try {
        setData(JSON.parse((event as MessageEvent).data) as Payload)
        setConnected(true)
      } catch {
        // Malformed frame — keep the last good snapshot.
      }
    })
    source.onopen = () => setConnected(true)
    source.onerror = () => setConnected(false)

    return () => source.close()
  }, [])

  async function refresh() {
    setRefreshing(true)
    try {
      const response = await fetch("/api/system/services?force=1")
      if (response.ok) setData((await response.json()) as Payload)
    } finally {
      setRefreshing(false)
    }
  }

  const down = data.services.filter((service) => service.state === "down")
  const unchecked = data.services.filter((service) => service.state === "unknown")

  return (
    <section className="rounded-lg border border-sa-border bg-sa-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-sa-border px-4 py-2.5">
        <div>
          <h2 className="text-h3">Service status</h2>
          <p className="text-caption text-sa-dim">
            Probed {new Date(data.probedAt).toLocaleTimeString("en-GB")} ·{" "}
            {connected ? "live" : "stream disconnected — showing the last snapshot"}
            {unchecked.length > 0 && ` · ${unchecked.length} not configured`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-sa-border px-2.5 text-caption text-sa-muted transition-colors hover:text-sa-text disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} aria-hidden="true" />
          Re-probe
        </button>
      </header>

      {down.length > 0 && (
        <p className="border-b border-sa-red/30 bg-sa-red/10 px-4 py-2 text-body text-sa-red">
          {down.map((service) => service.label).join(", ")} {down.length === 1 ? "is" : "are"} down.
        </p>
      )}

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.services.map((service) => (
          <article
            key={service.key}
            className={cn(
              "rounded-md border p-3",
              service.state === "down"
                ? "border-sa-red/40 bg-sa-red/5"
                : service.state === "degraded"
                  ? "border-sa-amber/40 bg-sa-amber/5"
                  : "border-sa-border bg-sa-raised/40",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-body text-sa-text">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[service.state])} aria-hidden="true" />
                {service.label}
              </span>
              <span className={cn("text-caption font-medium", TEXT[service.state])}>
                {LABEL[service.state]}
              </span>
            </div>

            <dl className="mt-2 flex items-baseline gap-4">
              <div>
                <dt className="text-caption text-sa-dim">Response</dt>
                <dd className="font-mono text-body tabular-nums text-sa-text">
                  {service.responseMs === null ? "—" : `${service.responseMs}ms`}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-sa-dim">Uptime</dt>
                <dd className="font-mono text-body tabular-nums text-sa-text">
                  {service.uptimePercent === null ? "—" : `${service.uptimePercent.toFixed(2)}%`}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-sa-dim">Samples</dt>
                <dd className="font-mono text-body tabular-nums text-sa-dim">{service.samples}</dd>
              </div>
            </dl>

            <p className="mt-1.5 text-caption text-sa-dim">{service.detail}</p>
          </article>
        ))}
      </div>

      <p className="border-t border-sa-border px-4 py-2 text-caption text-sa-dim">
        Uptime is measured from the probes this console has actually recorded, so it starts at 100%
        on a fresh Redis and needs a month of samples to mean a month. A service with no credentials
        configured is marked <span className="text-sa-text">Not checked</span> rather than assumed
        healthy.
      </p>
    </section>
  )
}
