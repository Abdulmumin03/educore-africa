"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { Download, Play, Plus, Trash2 } from "lucide-react"

import { cn, formatNumber } from "@/lib/utils"
import { ReportBuilder, type SourceMeta } from "./report-builder"

export type SavedReport = {
  id: string
  name: string
  description: string | null
  source: string
  fields: string[]
  schedule: string
  recipients: string[]
  createdBy: string
  createdById: string
  lastRunAt: string | null
  lastRun: {
    id: string
    status: string
    rows: number | null
    startedAt: string
    downloadUrl: string | null
    error: string | null
  } | null
}

const SCHEDULE_LABEL: Record<string, string> = {
  NONE: "Manual",
  DAILY: "Daily 06:00",
  WEEKLY: "Mondays 06:00",
  MONTHLY: "1st, 06:00",
}

const STATUS_TONE: Record<string, string> = {
  SUCCEEDED: "text-sa-green",
  FAILED: "text-sa-red",
  RUNNING: "text-sa-amber",
}

export function ReportsClient({
  initial,
  sources,
  maxRows,
  currentUserId,
  isOwner,
}: {
  initial: SavedReport[]
  sources: SourceMeta[]
  maxRows: number
  currentUserId: string
  isOwner: boolean
}) {
  const router = useRouter()
  const [reports, setReports] = React.useState(initial)
  const [building, setBuilding] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => setReports(initial), [initial])

  async function reload() {
    const response = await fetch("/api/reports")
    if (response.ok) setReports(((await response.json()) as { reports: SavedReport[] }).reports)
    router.refresh()
  }

  async function run(report: SavedReport) {
    setBusyId(report.id)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/reports/${report.id}/run`, { method: "POST" })
      const body = (await response.json()) as {
        rows?: number
        emailed?: number
        storage?: string
        notes?: string[]
        error?: string
      }
      if (!response.ok) throw new Error(body.error ?? "The report failed.")

      // Every way the run fell short of "sent to everyone" is surfaced, rather
      // than folded into a green tick.
      const parts = [`${formatNumber(body.rows ?? 0)} rows`]
      if (body.emailed) parts.push(`emailed to ${body.emailed}`)
      if (body.storage === "redis") parts.push("stored in Redis (no object store configured)")
      setNotice(`${report.name}: ${parts.join(" · ")}${body.notes?.length ? ` — ${body.notes.join(" ")}` : ""}`)
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusyId(null)
    }
  }

  async function remove(report: SavedReport) {
    if (!window.confirm(`Delete "${report.name}"? Its run history goes too.`)) return
    setBusyId(report.id)
    setError(null)
    try {
      const response = await fetch(`/api/reports/${report.id}`, { method: "DELETE" })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not delete.")
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusyId(null)
    }
  }

  const scheduled = reports.filter((report) => report.schedule !== "NONE").length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-body text-sa-muted">
          {reports.length} saved · {scheduled} on a schedule. Scheduled runs fire at 06:00 WAT and
          email an Excel file; every run is logged whether or not delivery worked.
        </p>
        <button
          type="button"
          onClick={() => setBuilding(true)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New report
        </button>
      </div>

      {error && <p className="text-body text-sa-red">{error}</p>}
      {notice && <p className="text-body text-sa-green">{notice}</p>}

      <section className="rounded-lg border border-sa-border bg-sa-surface">
        {reports.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-body text-sa-muted">No saved reports yet.</p>
            <p className="mx-auto mt-1 max-w-md text-caption text-sa-dim">
              A report is a saved query over one data source — pick the columns and filters once,
              then run it on demand or on a schedule.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="px-4 py-2 text-left font-medium">Report</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Source</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Created by</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Schedule</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Last run</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="border-b border-sa-border/60 last:border-0">
                    <td className="px-4 py-2">
                      <p className="text-sa-text">{report.name}</p>
                      {report.description && (
                        <p className="max-w-sm text-caption text-sa-dim">{report.description}</p>
                      )}
                      <p className="font-mono text-caption text-sa-disabled">
                        {report.fields.length} columns
                      </p>
                    </td>
                    <td className="px-3 py-2 text-caption capitalize text-sa-muted">
                      {report.source.replace(/_/g, " ").toLowerCase()}
                    </td>
                    <td className="px-3 py-2 text-caption text-sa-muted">{report.createdBy}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "text-caption",
                          report.schedule === "NONE" ? "text-sa-dim" : "text-sa-text",
                        )}
                      >
                        {SCHEDULE_LABEL[report.schedule] ?? report.schedule}
                      </span>
                      {report.recipients.length > 0 && (
                        <p className="text-caption text-sa-dim">
                          → {report.recipients.length} recipient
                          {report.recipients.length === 1 ? "" : "s"}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {report.lastRun ? (
                        <>
                          <span
                            className={cn(
                              "text-caption",
                              STATUS_TONE[report.lastRun.status] ?? "text-sa-muted",
                            )}
                          >
                            {report.lastRun.status === "SUCCEEDED"
                              ? `${formatNumber(report.lastRun.rows ?? 0)} rows`
                              : report.lastRun.status.toLowerCase()}
                          </span>
                          <p className="font-mono text-caption text-sa-dim">
                            {new Date(report.lastRun.startedAt).toLocaleString("en-GB")}
                          </p>
                          {report.lastRun.error && (
                            <p className="max-w-xs text-caption text-sa-red">{report.lastRun.error}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-caption text-sa-disabled">never</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        {report.lastRun?.downloadUrl && report.lastRun.status === "SUCCEEDED" && (
                          <a
                            href={report.lastRun.downloadUrl}
                            title="Download the last run"
                            className="rounded p-1 text-sa-dim transition-colors hover:bg-sa-raised hover:text-sa-text"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span className="sr-only">Download {report.name}</span>
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={busyId === report.id}
                          onClick={() => void run(report)}
                          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-sa-border px-2.5 text-caption text-sa-muted transition-colors hover:text-sa-text disabled:opacity-50"
                        >
                          <Play className="h-3 w-3" aria-hidden="true" />
                          {busyId === report.id ? "Running…" : "Run"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === report.id || (report.createdById !== currentUserId && !isOwner)}
                          title={
                            report.createdById !== currentUserId && !isOwner
                              ? "Only the author or a SUPER_ADMIN can delete this"
                              : "Delete"
                          }
                          onClick={() => void remove(report)}
                          className="rounded p-1 text-sa-dim transition-colors hover:bg-sa-raised hover:text-sa-red disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="sr-only">Delete {report.name}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-caption text-sa-dim">
        Nothing here runs itself. A scheduled report fires when an external scheduler calls{" "}
        <span className="font-mono">POST /api/cron/reports</span> with the shared secret — there is
        no cron daemon inside the console, and the README says how to point one at it.
      </p>

      {building && (
        <ReportBuilder
          sources={sources}
          maxRows={maxRows}
          onClose={() => setBuilding(false)}
          onSaved={() => void reload()}
        />
      )}
    </div>
  )
}
