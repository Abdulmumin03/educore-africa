"use client"

import * as React from "react"
import { RotateCcw } from "lucide-react"

import { Panel } from "@/components/shared/panel"
import { cn, formatNumber } from "@/lib/utils"

type QueueSnapshot = {
  name: string
  label: string
  state: "live" | "planned"
  note?: string
  pending: number | null
  active: number | null
  failed: number | null
  delayed: number | null
  completed24h: number | null
  workers: number | null
  paused: boolean
}

type FailedJob = {
  id: string
  name: string
  attempts: number
  failedReason: string
  data: unknown
  failedAt: string | null
}

export function QueueMonitor({
  initial,
}: {
  initial: { queues: QueueSnapshot[]; connected: boolean }
}) {
  const [data, setData] = React.useState(initial)
  const [openQueue, setOpenQueue] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState<FailedJob[]>([])
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)

  async function loadFailed(name: string) {
    setOpenQueue(name)
    setMessage(null)
    const response = await fetch(`/api/system/queues?failed=${encodeURIComponent(name)}`)
    if (!response.ok) return
    const body = (await response.json()) as typeof initial & { failed: FailedJob[] }
    setData({ queues: body.queues, connected: body.connected })
    setFailed(body.failed)
  }

  async function retry(name: string, jobId?: string) {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/system/queues/${encodeURIComponent(name)}/retry-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobId ? { jobId } : {}),
      })
      const body = (await response.json()) as { retried?: number; skipped?: number; error?: string }
      if (!response.ok) throw new Error(body.error ?? "Retry failed.")
      setMessage(
        `Re-queued ${body.retried ?? 0} job(s)${body.skipped ? `, skipped ${body.skipped}` : ""}.`,
      )
      await loadFailed(name)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  const planned = data.queues.filter((queue) => queue.state === "planned")

  return (
    <Panel
      title="Background jobs"
      subtitle={
        data.connected
          ? "Live counts from BullMQ."
          : "Could not reach the queue backend — live counts are unavailable."
      }
      bodyClassName="p-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body">
          <thead>
            <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Queue
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Pending
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Active
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Failed
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Done 24h
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Workers
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {data.queues.map((queue) => (
              <tr
                key={queue.name}
                className={cn(
                  "border-b border-sa-border/60 last:border-0",
                  queue.state === "planned" && "opacity-60",
                )}
              >
                <td className="px-4 py-2">
                  <span className="text-sa-text">{queue.label}</span>
                  <span className="ml-2 font-mono text-caption text-sa-dim">{queue.name}</span>
                  {queue.state === "planned" && (
                    <span className="ml-2 rounded border border-sa-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sa-dim">
                      not implemented
                    </span>
                  )}
                  {queue.paused && (
                    <span className="ml-2 rounded bg-sa-amber/15 px-1.5 py-0.5 text-[10px] uppercase text-sa-amber">
                      paused
                    </span>
                  )}
                </td>
                {(["pending", "active", "failed", "completed24h", "workers"] as const).map((key) => (
                  <td
                    key={key}
                    className={cn(
                      "px-3 py-2 text-right font-mono tabular-nums",
                      key === "failed" && (queue.failed ?? 0) > 0
                        ? "text-sa-red"
                        : key === "workers" && queue.workers === 0
                          ? "text-sa-amber"
                          : "text-sa-muted",
                    )}
                  >
                    {queue[key] === null ? <span className="text-sa-disabled">—</span> : formatNumber(queue[key] as number)}
                  </td>
                ))}
                <td className="px-4 py-2 text-right">
                  {queue.state === "live" ? (
                    <button
                      type="button"
                      onClick={() => void loadFailed(queue.name)}
                      className="h-7 rounded-md border border-sa-border px-2.5 text-caption text-sa-muted transition-colors hover:text-sa-text"
                    >
                      {(queue.failed ?? 0) > 0 ? `View ${queue.failed} failed` : "Inspect"}
                    </button>
                  ) : (
                    <span className="text-caption text-sa-disabled">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {planned.length > 0 && (
        <div className="border-t border-sa-border px-4 py-2">
          <p className="mb-1 text-caption uppercase tracking-wide text-sa-dim">
            Why {planned.length} of these are empty
          </p>
          <ul className="space-y-0.5">
            {planned.map((queue) => (
              <li key={queue.name} className="text-caption text-sa-dim">
                <span className="text-sa-muted">{queue.label}:</span> {queue.note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {openQueue && (
        <div className="border-t border-sa-border">
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <p className="text-caption uppercase tracking-wide text-sa-dim">
              Failed jobs · {openQueue}
            </p>
            <div className="flex items-center gap-2">
              {failed.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void retry(openQueue)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-sa-blue px-2.5 text-caption font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  Retry all
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpenQueue(null)}
                className="text-caption text-sa-dim hover:text-sa-text"
              >
                Close
              </button>
            </div>
          </div>

          {message && <p className="px-4 pb-2 text-caption text-sa-green">{message}</p>}

          {failed.length === 0 ? (
            <p className="px-4 pb-4 text-body text-sa-muted">Nothing has failed on this queue.</p>
          ) : (
            <ul className="max-h-[320px] overflow-y-auto border-t border-sa-border">
              {failed.map((job) => (
                <li key={job.id} className="border-b border-sa-border/60 px-4 py-2 last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-caption text-sa-text">
                        {job.name} · #{job.id} · {job.attempts} attempt{job.attempts === 1 ? "" : "s"}
                      </p>
                      <p className="text-caption text-sa-red">{job.failedReason}</p>
                      <pre className="mt-1 max-w-full overflow-x-auto rounded bg-sa-raised/60 p-2 font-mono text-[10px] text-sa-dim">
                        {JSON.stringify(job.data, null, 2)}
                      </pre>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void retry(openQueue, job.id)}
                      className="h-7 shrink-0 rounded-md border border-sa-border px-2.5 text-caption text-sa-muted transition-colors hover:text-sa-text disabled:opacity-50"
                    >
                      Retry
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  )
}
