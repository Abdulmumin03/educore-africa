import { NextResponse } from "next/server"

import { createExportJob, type ExportFormat } from "@/lib/export-jobs"
import { getSource, type Filter } from "@/lib/reports"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Start an export of whatever the caller is looking at.
 *
 * Returns a job id to poll. The job is already finished by the time this
 * responds — see lib/export-jobs for why the polling shape is kept anyway.
 */
export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const source = getSource(typeof body.source === "string" ? body.source : "")
  if (!source) return NextResponse.json({ error: "Unknown data source." }, { status: 400 })

  const known = new Set(source.fields.map((field) => field.key))
  const fields = Array.isArray(body.fields)
    ? body.fields.filter((key): key is string => typeof key === "string" && known.has(key))
    : []

  const result = await createExportJob({
    source: source.key,
    // An export with no columns named falls back to the source's defaults
    // rather than failing — the caller is usually a table that already knows
    // what it is showing.
    fields: fields.length > 0 ? fields : source.defaultFields,
    filters: Array.isArray(body.filters) ? (body.filters as Filter[]) : [],
    sortField: typeof body.sortField === "string" ? body.sortField : null,
    sortDir: body.sortDir === "asc" ? "asc" : "desc",
    limit: typeof body.limit === "number" ? body.limit : null,
    format: (["csv", "pdf", "html"] as const).includes(body.format as never)
      ? (body.format as ExportFormat)
      : "xlsx",
    requestedById: guard.user.id,
    requestedByName: guard.user.name,
    filenameHint: typeof body.filenameHint === "string" ? body.filenameHint : undefined,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json(
    {
      jobId: result.jobId,
      rows: result.rows,
      // What was actually produced, which is not always what was requested.
      format: result.format,
      notice: result.notice,
    },
    { status: 202 },
  )
}
