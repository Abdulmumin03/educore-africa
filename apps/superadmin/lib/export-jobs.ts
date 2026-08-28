import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import { buildCsv, buildWorkbook, renderPdf, reportHtml, type Column } from "@/lib/report-export"
import { describeFilters } from "@/lib/report-scheduler"
import { getSource, runReport, type Filter } from "@/lib/reports"

// Ad-hoc "Export" from any console table.
//
// The job runs INLINE and the row is created READY: there is no worker, and
// pretending otherwise would mean a queue that never drains. The polling API
// the spec asks for is still there and still correct — a client that polls
// simply finds the job finished on its first check, which is the honest
// outcome for a query that takes under a second.
//
// The shape is kept because it is the right shape: when exports outgrow a
// request timeout, the work moves behind BullMQ and nothing on the client
// changes.

export type ExportFormat = "xlsx" | "csv" | "pdf" | "html"

const FILE_PREFIX = "export:file:"
export const EXPORT_TTL_SECONDS = 30 * 60

export async function createExportJob(input: {
  source: string
  fields: string[]
  filters: Filter[]
  sortField?: string | null
  sortDir?: string
  limit?: number | null
  format: ExportFormat
  requestedById: string
  requestedByName: string
  filenameHint?: string
}): Promise<
  | { ok: true; jobId: string; rows: number; format: ExportFormat; notice: string | null }
  | { ok: false; error: string }
> {
  const source = getSource(input.source)
  if (!source) return { ok: false, error: "Unknown data source." }

  const stamp = new Date().toISOString().slice(0, 10)
  const slug =
    (input.filenameHint ?? source.label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "export"
  const job = await prisma.exportJob.create({
    data: {
      status: "RUNNING",
      source: source.key,
      format: input.format,
      filters: input.filters as never,
      filename: `${slug}-${stamp}.${input.format}`,
      requestedById: input.requestedById,
    },
    select: { id: true },
  })

  const result = await runReport({
    source: input.source,
    fields: input.fields,
    filters: input.filters,
    sortField: input.sortField,
    sortDir: input.sortDir,
    limit: input.limit,
  })

  if ("error" in result) {
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: result.error, finishedAt: new Date() },
    })
    return { ok: false, error: result.error }
  }

  let buffer: Buffer
  // The format actually produced. Only PDF can differ from what was asked
  // for, and only in one direction — see the Chromium branch below.
  let format: ExportFormat = input.format
  let notice: string | null = null

  try {
    if (input.format === "csv") {
      buffer = Buffer.from(buildCsv(result.columns as Column[], result.rows), "utf8")
    } else if (input.format === "pdf" || input.format === "html") {
      const html = reportHtml({
        title: `${source.label} export`,
        columns: result.columns as Column[],
        rows: result.rows,
        filters: describeFilters(input.source, input.filters),
        generatedBy: input.requestedByName,
        truncatedFrom: result.truncated ? result.total : null,
      })

      if (input.format === "html") {
        buffer = Buffer.from(html, "utf8")
      } else {
        const pdf = await renderPdf(html)
        if (pdf.ok) {
          buffer = pdf.buffer
        } else {
          // Chromium is absent. The print-ready HTML is delivered instead —
          // renamed, so nothing claims to be a PDF that is not one — and the
          // reason travels with the job rather than being swallowed.
          buffer = Buffer.from(pdf.html, "utf8")
          format = "html"
          notice = pdf.reason
        }
      }
    } else {
      buffer = await buildWorkbook({
        title: `${source.label} export`,
        columns: result.columns as Column[],
        rows: result.rows,
        filters: describeFilters(input.source, input.filters),
        generatedBy: input.requestedByName,
        truncatedFrom: result.truncated ? result.total : null,
      })
    }
  } catch (error) {
    const message =
      error instanceof Error ? `Could not build the file: ${error.message}` : "Could not build the file."
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: message, finishedAt: new Date() },
    })
    return { ok: false, error: message }
  }

  try {
    await redis.set(`${FILE_PREFIX}${job.id}`, buffer.toString("base64"), "EX", EXPORT_TTL_SECONDS)
  } catch {
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: "Could not store the file — Redis is unreachable.", finishedAt: new Date() },
    })
    return { ok: false, error: "Could not store the file — Redis is unreachable." }
  }

  await prisma.exportJob.update({
    where: { id: job.id },
    data: {
      status: "READY",
      format,
      filename: `${slug}-${stamp}.${format}`,
      rows: result.rows.length,
      bytes: buffer.byteLength,
      // `error` on a READY job is a shortfall, not a failure: the file is
      // there, it is just not the format that was asked for.
      error: notice,
      expiresAt: new Date(Date.now() + EXPORT_TTL_SECONDS * 1000),
      finishedAt: new Date(),
    },
  })

  return { ok: true, jobId: job.id, rows: result.rows.length, format, notice }
}

export async function readExportFile(jobId: string): Promise<Buffer | null> {
  try {
    const stored = await redis.get(`${FILE_PREFIX}${jobId}`)
    return stored ? Buffer.from(stored, "base64") : null
  } catch {
    return null
  }
}
