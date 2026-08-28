"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { Plus, Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"

export type FieldMeta = {
  key: string
  label: string
  type: "text" | "number" | "currency" | "date" | "enum" | "boolean"
  options?: string[]
  advanced: boolean
}

export type SourceMeta = {
  key: string
  label: string
  description: string
  defaultFields: string[]
  defaultSort: string
  fields: FieldMeta[]
}

type FilterRow = { id: string; field: string; operator: string; value: string }

type Preview = {
  columns: Array<{ key: string; label: string; type: string }>
  rows: Array<Record<string, unknown>>
  total: number
  truncated: boolean
  ms: number
}

// Mirrors OPERATORS in lib/reports. Kept in step by the smoke test, which
// exercises one operator from every family through the real endpoint.
const OPERATORS: Record<string, Array<{ value: string; label: string; needsValue: boolean }>> = {
  text: [
    { value: "contains", label: "contains", needsValue: true },
    { value: "eq", label: "is", needsValue: true },
    { value: "neq", label: "is not", needsValue: true },
    { value: "is_null", label: "is empty", needsValue: false },
    { value: "not_null", label: "is not empty", needsValue: false },
  ],
  number: [
    { value: "eq", label: "is", needsValue: true },
    { value: "gt", label: "greater than", needsValue: true },
    { value: "gte", label: "at least", needsValue: true },
    { value: "lt", label: "less than", needsValue: true },
    { value: "lte", label: "at most", needsValue: true },
    { value: "is_null", label: "is empty", needsValue: false },
    { value: "not_null", label: "is not empty", needsValue: false },
  ],
  currency: [
    { value: "gte", label: "at least", needsValue: true },
    { value: "lte", label: "at most", needsValue: true },
    { value: "gt", label: "greater than", needsValue: true },
    { value: "lt", label: "less than", needsValue: true },
    { value: "eq", label: "is", needsValue: true },
  ],
  date: [
    { value: "last_n_days", label: "in the last N days", needsValue: true },
    { value: "after", label: "on or after", needsValue: true },
    { value: "before", label: "before", needsValue: true },
    { value: "is_null", label: "is empty", needsValue: false },
    { value: "not_null", label: "is not empty", needsValue: false },
  ],
  enum: [
    { value: "eq", label: "is", needsValue: true },
    { value: "neq", label: "is not", needsValue: true },
    { value: "is_null", label: "is empty", needsValue: false },
    { value: "not_null", label: "is not empty", needsValue: false },
  ],
  boolean: [
    { value: "is_true", label: "is yes", needsValue: false },
    { value: "is_false", label: "is no", needsValue: false },
  ],
}

const STEPS = ["Source", "Fields", "Filters", "Sort & limit", "Schedule"]

function newId() {
  return Math.random().toString(36).slice(2, 9)
}

export function ReportBuilder({
  sources,
  maxRows,
  onClose,
  onSaved,
}: {
  sources: SourceMeta[]
  maxRows: number
  onClose: () => void
  onSaved: () => void
}) {
  const router = useRouter()
  const [step, setStep] = React.useState(0)

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [sourceKey, setSourceKey] = React.useState(sources[0]?.key ?? "")
  const [fields, setFields] = React.useState<string[]>(sources[0]?.defaultFields ?? [])
  const [filters, setFilters] = React.useState<FilterRow[]>([])
  const [sortField, setSortField] = React.useState(sources[0]?.defaultSort ?? "")
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc")
  const [rowLimit, setRowLimit] = React.useState<string>("500")
  const [schedule, setSchedule] = React.useState("NONE")
  const [recipients, setRecipients] = React.useState("")
  const [showAdvanced, setShowAdvanced] = React.useState(false)

  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  /** A run that succeeded but not exactly as asked — e.g. PDF served as HTML. */
  const [notice, setNotice] = React.useState<string | null>(null)

  const source = sources.find((entry) => entry.key === sourceKey) ?? sources[0]
  const byKey = React.useMemo(
    () => new Map(source?.fields.map((field) => [field.key, field]) ?? []),
    [source],
  )

  // Changing source invalidates every field and filter that referenced the old
  // one, so reset rather than carry a half-valid spec forward.
  function pickSource(key: string) {
    const next = sources.find((entry) => entry.key === key)
    if (!next) return
    setSourceKey(key)
    setFields(next.defaultFields)
    setFilters([])
    setSortField(next.defaultSort)
    setPreview(null)
    setError(null)
  }

  function payload() {
    return {
      name: name.trim(),
      description: description.trim() || null,
      source: sourceKey,
      fields,
      filters: filters
        .filter((row) => row.field && row.operator)
        .map((row) => ({ field: row.field, operator: row.operator, value: row.value })),
      sortField: sortField || null,
      sortDir,
      rowLimit: rowLimit === "all" ? null : Number(rowLimit),
      schedule,
      recipients: recipients
        .split(/[,\s]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    }
  }

  async function runPreview() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/reports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      })
      const body = (await response.json()) as Preview & { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Preview failed.")
      setPreview(body)
    } catch (cause) {
      setPreview(null)
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not save.")
      onSaved()
      router.refresh()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  async function exportNow(format: "xlsx" | "csv" | "pdf") {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const start = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), format, filenameHint: name || source?.label }),
      })
      const started = (await start.json()) as {
        jobId?: string
        error?: string
        format?: string
        notice?: string | null
      }
      if (!start.ok || !started.jobId) throw new Error(started.error ?? "Could not start the export.")

      // A PDF request can come back as print-ready HTML when Chromium is not
      // installed. The file still downloads; the swap is said out loud.
      if (started.notice) setNotice(started.notice)

      // Poll until the job reports READY. It usually is on the first check —
      // the work runs inline — but the contract is a poll, so poll.
      for (let attempt = 0; attempt < 30; attempt++) {
        const check = await fetch(`/api/export/${started.jobId}`)
        const job = (await check.json()) as { status?: string; downloadUrl?: string; error?: string }
        if (job.status === "READY" && job.downloadUrl) {
          window.location.href = job.downloadUrl
          return
        }
        if (job.status === "FAILED") throw new Error(job.error ?? "The export failed.")
        await new Promise((resolve) => setTimeout(resolve, 400))
      }
      throw new Error("The export did not finish in time.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  if (!source) return null

  const visibleFields = source.fields.filter((field) => showAdvanced || !field.advanced || fields.includes(field.key))
  const canSave = name.trim().length > 0 && fields.length > 0
  const scheduleNeedsRecipients = schedule !== "NONE" && recipients.trim().length === 0

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/55" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Build a report"
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-full max-w-[960px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-sa-border bg-sa-surface shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-sa-border px-4 py-3">
          <div>
            <h2 className="text-h3">Build a report</h2>
            <p className="text-caption text-sa-dim">
              {source.label} · {source.description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-sa-dim transition-colors hover:bg-sa-raised hover:text-sa-text"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* step rail */}
        <nav className="flex shrink-0 items-center gap-1 border-b border-sa-border px-4 py-2">
          {STEPS.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(index)}
              aria-current={index === step ? "step" : undefined}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-caption transition-colors",
                index === step
                  ? "bg-sa-raised text-sa-text"
                  : "text-sa-dim hover:text-sa-text",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-4 w-4 items-center justify-center rounded-full font-mono text-[10px]",
                  index === step ? "bg-sa-blue text-sa-base" : "bg-sa-raised text-sa-dim",
                )}
              >
                {index + 1}
              </span>
              {label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {error && <p className="mb-3 text-body text-sa-red">{error}</p>}
          {notice && <p className="mb-3 text-body text-sa-amber">{notice}</p>}

          {step === 0 && (
            <div className="space-y-3">
              <label className="block text-caption uppercase tracking-wide text-sa-dim">
                Report name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Lagos schools on Professional"
                  className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text placeholder:text-sa-disabled focus:border-sa-blue focus:outline-none"
                />
              </label>
              <label className="block text-caption uppercase tracking-wide text-sa-dim">
                Description
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
                />
              </label>

              <div>
                <p className="mb-2 text-caption uppercase tracking-wide text-sa-dim">Data source</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {sources.map((entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      aria-pressed={entry.key === sourceKey}
                      onClick={() => pickSource(entry.key)}
                      className={cn(
                        "rounded-md border p-3 text-left transition-colors",
                        entry.key === sourceKey
                          ? "border-sa-blue bg-sa-blue/10"
                          : "border-sa-border bg-sa-raised/40 hover:border-sa-blue/50",
                      )}
                    >
                      <span className="block text-body text-sa-text">{entry.label}</span>
                      <span className="mt-0.5 block text-caption text-sa-dim">{entry.description}</span>
                      <span className="mt-1 block font-mono text-caption text-sa-disabled">
                        {entry.fields.length} fields
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-caption uppercase tracking-wide text-sa-dim">
                  Columns · {fields.length} selected
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((open) => !open)}
                    className="text-caption text-sa-blue hover:underline"
                  >
                    {showAdvanced ? "Hide" : "Show"} advanced fields
                  </button>
                  <button
                    type="button"
                    onClick={() => setFields(source.defaultFields)}
                    className="text-caption text-sa-blue hover:underline"
                  >
                    Reset
                  </button>
                </div>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {visibleFields.map((field) => {
                  const on = fields.includes(field.key)
                  return (
                    <label
                      key={field.key}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors",
                        on ? "border-sa-blue/60 bg-sa-blue/10" : "border-sa-border bg-sa-raised/30",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setFields((current) =>
                            on ? current.filter((key) => key !== field.key) : [...current, field.key],
                          )
                        }
                        className="h-3.5 w-3.5 rounded border-sa-border bg-sa-raised"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body text-sa-text">{field.label}</span>
                        <span className="block font-mono text-[10px] text-sa-dim">{field.type}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
              <p className="mt-3 text-caption text-sa-dim">
                Columns appear in the order you tick them. Untick and re-tick to move one to the end.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              {filters.length === 0 && (
                <p className="rounded-md border border-dashed border-sa-border px-3 py-6 text-center text-body text-sa-dim">
                  No filters — the report covers every row in {source.label.toLowerCase()}.
                </p>
              )}

              {filters.map((row) => {
                const field = byKey.get(row.field)
                const operators = field ? OPERATORS[field.type] : []
                const operator = operators.find((entry) => entry.value === row.operator)
                return (
                  <div key={row.id} className="flex flex-wrap items-center gap-2">
                    <select
                      value={row.field}
                      onChange={(event) => {
                        const nextField = byKey.get(event.target.value)
                        setFilters((current) =>
                          current.map((entry) =>
                            entry.id === row.id
                              ? {
                                  ...entry,
                                  field: event.target.value,
                                  // The old operator may not exist on the new
                                  // field's type, so reset to its first one.
                                  operator: nextField ? OPERATORS[nextField.type][0].value : "",
                                  value: "",
                                }
                              : entry,
                          ),
                        )
                      }}
                      className="h-8 w-48 rounded-md border border-sa-border bg-sa-raised px-2 text-body text-sa-text focus:border-sa-blue focus:outline-none"
                    >
                      {source.fields.map((entry) => (
                        <option key={entry.key} value={entry.key}>
                          {entry.label}
                        </option>
                      ))}
                    </select>

                    <select
                      value={row.operator}
                      onChange={(event) =>
                        setFilters((current) =>
                          current.map((entry) =>
                            entry.id === row.id ? { ...entry, operator: event.target.value } : entry,
                          ),
                        )
                      }
                      className="h-8 w-44 rounded-md border border-sa-border bg-sa-raised px-2 text-body text-sa-text focus:border-sa-blue focus:outline-none"
                    >
                      {operators.map((entry) => (
                        <option key={entry.value} value={entry.value}>
                          {entry.label}
                        </option>
                      ))}
                    </select>

                    {operator?.needsValue &&
                      (field?.type === "enum" && field.options ? (
                        <select
                          value={row.value}
                          onChange={(event) =>
                            setFilters((current) =>
                              current.map((entry) =>
                                entry.id === row.id ? { ...entry, value: event.target.value } : entry,
                              ),
                            )
                          }
                          className="h-8 w-44 rounded-md border border-sa-border bg-sa-raised px-2 text-body text-sa-text focus:border-sa-blue focus:outline-none"
                        >
                          <option value="">Pick…</option>
                          {field.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={
                            field?.type === "date" && row.operator !== "last_n_days"
                              ? "date"
                              : field?.type === "number" || field?.type === "currency" || row.operator === "last_n_days"
                                ? "number"
                                : "text"
                          }
                          value={row.value}
                          onChange={(event) =>
                            setFilters((current) =>
                              current.map((entry) =>
                                entry.id === row.id ? { ...entry, value: event.target.value } : entry,
                              ),
                            )
                          }
                          className="h-8 w-44 rounded-md border border-sa-border bg-sa-raised px-2.5 text-body text-sa-text focus:border-sa-blue focus:outline-none"
                        />
                      ))}

                    <button
                      type="button"
                      onClick={() => setFilters((current) => current.filter((entry) => entry.id !== row.id))}
                      aria-label="Remove filter"
                      className="rounded p-1 text-sa-dim transition-colors hover:bg-sa-raised hover:text-sa-red"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}

              <button
                type="button"
                onClick={() => {
                  const first = source.fields[0]
                  setFilters((current) => [
                    ...current,
                    {
                      id: newId(),
                      field: first.key,
                      operator: OPERATORS[first.type][0].value,
                      value: "",
                    },
                  ])
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sa-border px-3 text-body text-sa-muted transition-colors hover:text-sa-text"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add filter
              </button>

              {filters.length > 1 && (
                <p className="text-caption text-sa-dim">
                  Filters combine with AND. There is no OR — a report that needs one is usually two
                  reports.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-wrap gap-4">
              <label className="text-caption uppercase tracking-wide text-sa-dim">
                Sort by
                <select
                  value={sortField}
                  onChange={(event) => setSortField(event.target.value)}
                  className="mt-1 block h-8 w-52 rounded-md border border-sa-border bg-sa-raised px-2 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
                >
                  {source.fields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-caption uppercase tracking-wide text-sa-dim">
                Direction
                <select
                  value={sortDir}
                  onChange={(event) => setSortDir(event.target.value as "asc" | "desc")}
                  className="mt-1 block h-8 w-36 rounded-md border border-sa-border bg-sa-raised px-2 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </label>
              <label className="text-caption uppercase tracking-wide text-sa-dim">
                Row limit
                <select
                  value={rowLimit}
                  onChange={(event) => setRowLimit(event.target.value)}
                  className="mt-1 block h-8 w-40 rounded-md border border-sa-border bg-sa-raised px-2 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
                >
                  <option value="100">100 rows</option>
                  <option value="500">500 rows</option>
                  <option value="all">All rows</option>
                </select>
              </label>
              <p className="w-full text-caption text-sa-dim">
                &ldquo;All rows&rdquo; is capped at {maxRows.toLocaleString("en-NG")} — the file says
                so on its cover sheet when it hits the ceiling, rather than looking complete.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "NONE", label: "Do not schedule" },
                  { value: "DAILY", label: "Daily" },
                  { value: "WEEKLY", label: "Weekly (Monday)" },
                  { value: "MONTHLY", label: "Monthly (1st)" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={schedule === option.value}
                    onClick={() => setSchedule(option.value)}
                    className={cn(
                      "h-8 rounded-md border px-3 text-body transition-colors",
                      schedule === option.value
                        ? "border-sa-blue bg-sa-blue/15 text-sa-text"
                        : "border-sa-border text-sa-muted hover:text-sa-text",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {schedule !== "NONE" && (
                <>
                  <label className="block text-caption uppercase tracking-wide text-sa-dim">
                    Deliver to
                    <input
                      value={recipients}
                      onChange={(event) => setRecipients(event.target.value)}
                      placeholder="ada@educoreafrica.com, tunde@educoreafrica.com"
                      className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text placeholder:text-sa-disabled focus:border-sa-blue focus:outline-none"
                    />
                  </label>
                  {scheduleNeedsRecipients && (
                    <p className="text-caption text-sa-amber">
                      A scheduled report needs at least one recipient — otherwise nothing tells anyone
                      it ran.
                    </p>
                  )}
                  <p className="text-caption text-sa-dim">
                    Runs at 06:00 WAT. Each run emails an Excel file with a download link that lives
                    for seven days, and appears in this report&rsquo;s run log either way.
                  </p>
                </>
              )}
            </div>
          )}

          {preview && (
            <div className="mt-4 rounded-md border border-sa-border">
              <div className="flex items-center justify-between border-b border-sa-border px-3 py-2">
                <span className="text-caption uppercase tracking-wide text-sa-dim">
                  Preview · first {preview.rows.length} of {preview.total.toLocaleString("en-NG")} matching
                </span>
                <span className="font-mono text-caption text-sa-dim">{preview.ms}ms</span>
              </div>
              {preview.rows.length === 0 ? (
                <p className="px-3 py-6 text-center text-body text-sa-muted">
                  Nothing matches these filters.
                </p>
              ) : (
                <div className="max-h-64 overflow-auto">
                  <table className="w-full border-collapse text-body">
                    <thead>
                      <tr>
                        {preview.columns.map((column) => (
                          <th
                            key={column.key}
                            className="sticky top-0 whitespace-nowrap bg-sa-surface px-2.5 py-1.5 text-left text-caption uppercase tracking-wide text-sa-dim"
                          >
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, index) => (
                        <tr key={index} className="border-t border-sa-border/60">
                          {preview.columns.map((column) => {
                            const value = row[column.key]
                            const numeric = column.type === "number" || column.type === "currency"
                            return (
                              <td
                                key={column.key}
                                className={cn(
                                  "max-w-[220px] truncate px-2.5 py-1 text-caption",
                                  numeric ? "text-right font-mono tabular-nums text-sa-text" : "text-sa-muted",
                                )}
                              >
                                {value === null || value === undefined || value === ""
                                  ? "—"
                                  : typeof value === "boolean"
                                    ? value ? "Yes" : "No"
                                    : column.type === "date"
                                      ? new Date(String(value)).toLocaleDateString("en-GB")
                                      : numeric
                                        ? Number(value).toLocaleString("en-NG")
                                        : String(value)}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-sa-border px-4 py-3">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            className="h-8 rounded-md border border-sa-border px-3 text-body text-sa-muted transition-colors hover:text-sa-text disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            disabled={step === STEPS.length - 1}
            onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))}
            className="h-8 rounded-md border border-sa-border px-3 text-body text-sa-muted transition-colors hover:text-sa-text disabled:opacity-40"
          >
            Next
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || fields.length === 0}
              onClick={() => void runPreview()}
              className="h-8 rounded-md border border-sa-border px-3 text-body text-sa-muted transition-colors hover:text-sa-text disabled:opacity-40"
            >
              {busy ? "Working…" : "Preview"}
            </button>
            <button
              type="button"
              disabled={busy || fields.length === 0}
              onClick={() => void exportNow("csv")}
              className="h-8 rounded-md border border-sa-border px-3 text-body text-sa-muted transition-colors hover:text-sa-text disabled:opacity-40"
            >
              CSV
            </button>
            <button
              type="button"
              disabled={busy || fields.length === 0}
              onClick={() => void exportNow("pdf")}
              title="A4 landscape, light theme, with a cover page"
              className="h-8 rounded-md border border-sa-border px-3 text-body text-sa-muted transition-colors hover:text-sa-text disabled:opacity-40"
            >
              PDF
            </button>
            <button
              type="button"
              disabled={busy || fields.length === 0}
              onClick={() => void exportNow("xlsx")}
              className="h-8 rounded-md border border-sa-border px-3 text-body text-sa-muted transition-colors hover:text-sa-text disabled:opacity-40"
            >
              Export now
            </button>
            <button
              type="button"
              disabled={busy || !canSave || scheduleNeedsRecipients}
              onClick={() => void save()}
              className="h-8 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:opacity-40"
            >
              Save report
            </button>
          </div>
        </footer>
      </div>
    </>
  )
}
