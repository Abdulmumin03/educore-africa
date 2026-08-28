"use client"

import * as React from "react"
import { AlertTriangle } from "lucide-react"

import { Panel } from "@/components/shared/panel"
import { cn, formatNumber } from "@/lib/utils"

type ErrorEntry = {
  id: string
  at: number
  endpoint: string
  method: string
  status: number
  message: string
  schoolId: string | null
  count: number
}

type Rate = {
  endpoint: string
  total: number
  errors: number
  errorRate: number
  spiking: boolean
}

type Payload = {
  entries: ErrorEntry[]
  rates: Rate[]
  spikes: Rate[]
  captured: boolean
  windowHours: number
}

const WINDOWS = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "48h", hours: 48 },
]

export function ErrorMonitor({ initial }: { initial: Payload }) {
  const [data, setData] = React.useState(initial)
  const [hours, setHours] = React.useState(24)
  const [minStatus, setMinStatus] = React.useState(400)
  const [endpoint, setEndpoint] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        since: new Date(Date.now() - hours * 3_600_000).toISOString(),
        minStatus: String(minStatus),
      })
      if (endpoint) params.set("endpoint", endpoint)
      const response = await fetch(`/api/system/errors?${params.toString()}`)
      if (response.ok) setData((await response.json()) as Payload)
    } finally {
      setLoading(false)
    }
  }, [hours, minStatus, endpoint])

  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <Panel
      title="API errors"
      subtitle={`Rejections past the front door — expired or revoked sessions, blocked addresses, deactivated accounts — over the last ${data.windowHours} hours. Plain "not signed in" 401s are answered by edge middleware and are not counted, and the school app has its own process.`}
      action={
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-sa-border" role="group">
            {WINDOWS.map((window) => (
              <button
                key={window.hours}
                type="button"
                aria-pressed={hours === window.hours}
                onClick={() => setHours(window.hours)}
                className={cn(
                  "h-7 px-2.5 text-caption transition-colors",
                  hours === window.hours ? "bg-sa-raised text-sa-text" : "text-sa-dim hover:text-sa-text",
                )}
              >
                {window.label}
              </button>
            ))}
          </div>
          <select
            value={minStatus}
            onChange={(event) => setMinStatus(Number(event.target.value))}
            aria-label="Minimum status code"
            className="h-7 rounded-md border border-sa-border bg-sa-raised px-2 text-caption text-sa-text focus:border-sa-blue focus:outline-none"
          >
            <option value={400}>4xx and 5xx</option>
            <option value={500}>5xx only</option>
          </select>
        </div>
      }
      bodyClassName="p-0"
    >
      {data.spikes.length > 0 && (
        <div className="border-b border-sa-amber/30 bg-sa-amber/10 px-4 py-2">
          <p className="flex items-center gap-2 text-body text-sa-amber">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {data.spikes.length} endpoint{data.spikes.length === 1 ? "" : "s"} above a 10% error rate:{" "}
            {data.spikes
              .slice(0, 3)
              .map((spike) => `${spike.endpoint} (${spike.errorRate.toFixed(0)}%)`)
              .join(", ")}
          </p>
        </div>
      )}

      {endpoint && (
        <div className="flex items-center justify-between border-b border-sa-border px-4 py-1.5">
          <span className="font-mono text-caption text-sa-muted">Filtered to {endpoint}</span>
          <button
            type="button"
            onClick={() => setEndpoint(null)}
            className="text-caption text-sa-blue hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto">
          {data.entries.length === 0 ? (
            <p className="px-4 py-10 text-center text-body text-sa-muted">
              {loading ? "Loading…" : "No errors in this window."}
            </p>
          ) : (
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    When
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Endpoint
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Message
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-sa-border/60 last:border-0">
                    <td className="px-4 py-1.5 font-mono text-caption tabular-nums text-sa-dim">
                      {new Date(entry.at).toLocaleTimeString("en-GB")}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-caption text-sa-text">
                        {entry.method} {entry.endpoint}
                      </span>
                      {entry.schoolId && (
                        <span className="ml-2 rounded bg-sa-raised px-1.5 py-0.5 font-mono text-[10px] text-sa-dim">
                          school {entry.schoolId.slice(0, 8)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={cn(
                          "font-mono text-caption tabular-nums",
                          entry.status >= 500 ? "text-sa-red" : "text-sa-amber",
                        )}
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td className="max-w-[280px] truncate px-3 py-1.5 text-caption text-sa-muted" title={entry.message}>
                      {entry.message}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-sa-muted">
                      {entry.count > 1 ? `×${entry.count}` : "1"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-sa-border lg:border-l lg:border-t-0">
          <p className="border-b border-sa-border px-3 py-2 text-caption uppercase tracking-wide text-sa-dim">
            Error rate by endpoint
          </p>
          {data.rates.length === 0 ? (
            <p className="px-3 py-6 text-caption text-sa-dim">Nothing recorded yet.</p>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto">
              {data.rates.slice(0, 30).map((rate) => (
                <li key={rate.endpoint} className="border-b border-sa-border/60 px-3 py-1.5 last:border-0">
                  <button
                    type="button"
                    onClick={() => setEndpoint(rate.endpoint)}
                    className="w-full text-left"
                  >
                    <span className="block truncate font-mono text-caption text-sa-text" title={rate.endpoint}>
                      {rate.endpoint}
                    </span>
                    <span className="flex items-center gap-2 text-caption">
                      <span
                        className={cn(
                          "font-mono tabular-nums",
                          rate.spiking ? "text-sa-amber" : rate.errors > 0 ? "text-sa-muted" : "text-sa-dim",
                        )}
                      >
                        {rate.errorRate.toFixed(1)}%
                      </span>
                      <span className="text-sa-dim">
                        {formatNumber(rate.errors)}/{formatNumber(rate.total)}
                      </span>
                      {rate.spiking && (
                        <span className="ml-auto rounded bg-sa-amber/15 px-1.5 text-[10px] uppercase text-sa-amber">
                          spike
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  )
}
