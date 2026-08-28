import type { ReportSchedule } from "@prisma/client"

import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import { buildWorkbook, type Column } from "@/lib/report-export"
import { getSource, runReport, type Filter } from "@/lib/reports"

// Scheduled report delivery.
//
// Three things here are honest about what this platform actually has:
//
//   1. There is no worker and no cron daemon. The runner is an HTTP endpoint
//      (/api/cron/reports) that authenticates with CRON_SECRET, matching the
//      pattern apps/web already uses. Point a platform scheduler or a GitHub
//      Actions cron at it — the README says so.
//   2. There is no object store the console can rely on. Files go to S3 when
//      it is configured and to Redis with a TTL when it is not, and the run log
//      records WHICH, so nobody chases a link that was never uploaded.
//   3. Email goes through Resend over plain HTTP. Without a key nothing is
//      sent and the run is recorded as delivered to zero addresses — never as
//      a success.

/** How long a generated file stays fetchable. */
export const FILE_TTL_SECONDS = 7 * 24 * 60 * 60
const REDIS_PREFIX = "report:file:"
/** A file bigger than this is not going into Redis. */
const REDIS_MAX_BYTES = 8 * 1024 * 1024

export type Delivery = {
  storage: "s3" | "redis" | "none"
  downloadUrl: string | null
  expiresAt: Date | null
  emailed: number
  emailSkipped: string | null
  storageNote: string | null
}

function baseUrl(): string {
  return (
    process.env.SUPERADMIN_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3001"
  ).replace(/\/$/, "")
}

/**
 * Put the file somewhere a link can reach.
 *
 * S3 first when configured; Redis otherwise. Redis is not a file store and is
 * treated as the fallback it is — capped, TTL'd, and reported as such.
 */
async function store(id: string, filename: string, buffer: Buffer): Promise<Delivery> {
  const expiresAt = new Date(Date.now() + FILE_TTL_SECONDS * 1000)

  const bucket = process.env.S3_BUCKET
  const hasAwsCreds = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)

  if (bucket && hasAwsCreds) {
    try {
      // Imported here rather than at module scope: the SDK is optional, and a
      // console without S3 configured should not pay to load it.
      const { S3Client, PutObjectCommand, GetObjectCommand } = await import("@aws-sdk/client-s3")
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner")

      const client = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" })
      const key = `superadmin-reports/${id}/${filename}`

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      )

      // Signed for GET — signing the PutObjectCommand would hand the recipient
      // an upload URL that 403s the moment they click it.
      const downloadUrl = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: FILE_TTL_SECONDS },
      )

      return {
        storage: "s3",
        downloadUrl,
        expiresAt,
        emailed: 0,
        emailSkipped: null,
        storageNote: null,
      }
    } catch (error) {
      // Fall through to Redis rather than failing the run — the report ran,
      // and a reachable file beats a clean failure.
      console.error("[reports] S3 upload failed, falling back to Redis", error)
    }
  }

  if (buffer.byteLength > REDIS_MAX_BYTES) {
    return {
      storage: "none",
      downloadUrl: null,
      expiresAt: null,
      emailed: 0,
      emailSkipped: null,
      storageNote: `The file is ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB and there is no object store configured. Set S3_BUCKET and AWS credentials, or narrow the report.`,
    }
  }

  try {
    await redis.set(`${REDIS_PREFIX}${id}`, buffer.toString("base64"), "EX", FILE_TTL_SECONDS)
  } catch {
    return {
      storage: "none",
      downloadUrl: null,
      expiresAt: null,
      emailed: 0,
      emailSkipped: null,
      storageNote: "The file could not be stored — Redis is unreachable and S3 is not configured.",
    }
  }

  return {
    storage: "redis",
    downloadUrl: `${baseUrl()}/api/reports/download/${id}`,
    expiresAt,
    emailed: 0,
    emailSkipped: null,
    storageNote:
      "Stored in Redis for 7 days because no object store is configured. The link only works from inside the console.",
  }
}

export async function readStoredFile(id: string): Promise<Buffer | null> {
  try {
    const stored = await redis.get(`${REDIS_PREFIX}${id}`)
    return stored ? Buffer.from(stored, "base64") : null
  } catch {
    return null
  }
}

function emailHtml(input: {
  name: string
  rows: number
  downloadUrl: string | null
  storageNote: string | null
  filters: string[]
}): string {
  const button = input.downloadUrl
    ? `<p style="margin:22px 0"><a href="${input.downloadUrl}"
         style="display:inline-block;background:#0A1628;color:#F8FAFC;text-decoration:none;
                padding:11px 20px;border-radius:6px;font-weight:600">Download the report</a></p>
       <p style="font-size:12px;color:#64748B;margin:0 0 4px">The link expires in 7 days.</p>`
    : `<p style="margin:22px 0;padding:11px 14px;border-left:3px solid #B91C1C;background:#FEF2F2;
         color:#7F1D1D;font-size:13px">The report ran but the file could not be stored, so there is
         nothing to download. ${input.storageNote ?? ""}</p>`

  return `<div style="font-family:'Segoe UI',Arial,sans-serif;color:#0A1628;max-width:560px">
  <p style="font-size:15px;font-weight:600;margin:0 0 4px">${input.name}</p>
  <p style="font-size:13px;color:#475569;margin:0">
    ${input.rows.toLocaleString("en-NG")} rows · generated ${new Date().toLocaleString("en-GB")}
  </p>
  ${button}
  <p style="font-size:12px;color:#64748B;margin:16px 0 0">
    Filters: ${input.filters.length ? input.filters.join(" · ") : "none"}
  </p>
  <p style="font-size:11px;color:#94A3B8;margin:18px 0 0;border-top:1px solid #E2E8F0;padding-top:10px">
    Confidential — EduCore Africa internal. This report contains data from multiple tenant schools.
  </p>
</div>`
}

async function sendEmails(
  recipients: string[],
  subject: string,
  html: string,
): Promise<{ emailed: number; skipped: string | null }> {
  if (recipients.length === 0) return { emailed: 0, skipped: null }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return {
      emailed: 0,
      skipped: "RESEND_API_KEY is not set, so no email was sent. The download link is on the run log.",
    }
  }

  const from = process.env.EMAIL_FROM ?? "EduCore Africa <noreply@educore.africa>"
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: recipients, subject, html }),
    })
    if (!response.ok) {
      const detail = await response.text()
      return { emailed: 0, skipped: `Resend refused the message (HTTP ${response.status}). ${detail.slice(0, 140)}` }
    }
    return { emailed: recipients.length, skipped: null }
  } catch (error) {
    return {
      emailed: 0,
      skipped: error instanceof Error ? `Could not reach Resend: ${error.message}` : "Could not reach Resend.",
    }
  }
}

/** Human-readable filter lines for the cover sheet and the email. */
export function describeFilters(sourceKey: string, filters: Filter[]): string[] {
  const source = getSource(sourceKey)
  if (!source) return []
  return filters.map((filter) => {
    const field = source.fields.find((entry) => entry.key === filter.field)
    const value = Array.isArray(filter.value) ? filter.value.join(", ") : String(filter.value ?? "")
    return `${field?.label ?? filter.field} ${filter.operator.replace(/_/g, " ")}${value ? ` ${value}` : ""}`
  })
}

export type RunOutcome = {
  runId: string
  status: "SUCCEEDED" | "FAILED"
  rows: number
  error: string | null
  delivery: Delivery | null
  durationMs: number
}

/**
 * Execute one saved report end to end and log the attempt.
 *
 * The log row is written BEFORE the work starts and updated after, so a run
 * that crashes mid-way leaves a RUNNING row somebody can see rather than no
 * trace at all.
 */
export async function executeReport(
  configId: string,
  trigger: "manual" | "schedule",
): Promise<RunOutcome> {
  const startedAt = Date.now()

  const config = await prisma.reportConfig.findUnique({ where: { id: configId } })
  if (!config) {
    return {
      runId: "",
      status: "FAILED",
      rows: 0,
      error: "Report not found.",
      delivery: null,
      durationMs: 0,
    }
  }

  const run = await prisma.reportRunLog.create({
    data: { configId: config.id, status: "RUNNING", trigger },
    select: { id: true },
  })

  const fail = async (message: string): Promise<RunOutcome> => {
    const durationMs = Date.now() - startedAt
    await prisma.reportRunLog.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message, finishedAt: new Date(), durationMs },
    })
    return { runId: run.id, status: "FAILED", rows: 0, error: message, delivery: null, durationMs }
  }

  const filters = (config.filters as unknown as Filter[]) ?? []
  const result = await runReport({
    source: config.source,
    fields: config.fields,
    filters,
    sortField: config.sortField,
    sortDir: config.sortDir,
    limit: config.rowLimit,
  })

  if ("error" in result) return fail(result.error)

  const described = describeFilters(config.source, filters)
  const stamp = new Date().toISOString().slice(0, 10)
  const slug = config.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report"
  const filename = `${slug}-${stamp}.xlsx`

  let buffer: Buffer
  try {
    buffer = await buildWorkbook({
      title: config.name,
      subtitle: config.description ?? undefined,
      columns: result.columns as Column[],
      rows: result.rows,
      filters: described,
      truncatedFrom: result.truncated ? result.total : null,
    })
  } catch (error) {
    return fail(
      error instanceof Error ? `Could not build the workbook: ${error.message}` : "Could not build the workbook.",
    )
  }

  const delivery = await store(run.id, filename, buffer)

  const { emailed, skipped } = await sendEmails(
    config.recipients,
    `${config.name} — ${result.rows.length.toLocaleString("en-NG")} rows`,
    emailHtml({
      name: config.name,
      rows: result.rows.length,
      downloadUrl: delivery.downloadUrl,
      storageNote: delivery.storageNote,
      filters: described,
    }),
  )
  delivery.emailed = emailed
  delivery.emailSkipped = skipped

  const durationMs = Date.now() - startedAt

  await prisma.$transaction([
    prisma.reportRunLog.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        rows: result.rows.length,
        downloadUrl: delivery.downloadUrl,
        expiresAt: delivery.expiresAt,
        delivery: {
          storage: delivery.storage,
          emailed: delivery.emailed,
          recipients: config.recipients.length,
          emailSkipped: delivery.emailSkipped,
          storageNote: delivery.storageNote,
          truncated: result.truncated,
        },
        finishedAt: new Date(),
        durationMs,
      },
    }),
    prisma.reportConfig.update({ where: { id: config.id }, data: { lastRunAt: new Date() } }),
  ])

  return {
    runId: run.id,
    status: "SUCCEEDED",
    rows: result.rows.length,
    error: null,
    delivery,
    durationMs,
  }
}

/** Which schedules are due today. Monthly fires on the 1st, weekly on Monday. */
export function schedulesDueToday(now = new Date()): ReportSchedule[] {
  const due: ReportSchedule[] = ["DAILY"]
  // Africa/Lagos is UTC+1 year-round, so the local day is the UTC day shifted
  // an hour — computed rather than assumed, because "today" decides whether a
  // Monday report goes out on Monday.
  const lagos = new Date(now.getTime() + 60 * 60 * 1000)
  if (lagos.getUTCDay() === 1) due.push("WEEKLY")
  if (lagos.getUTCDate() === 1) due.push("MONTHLY")
  return due
}

export type SweepResult = {
  due: number
  succeeded: number
  failed: number
  schedules: ReportSchedule[]
  runs: Array<{ configId: string; name: string; status: string; rows: number; error: string | null }>
}

/** The whole daily sweep. Called by /api/cron/reports. */
export async function runDueReports(now = new Date()): Promise<SweepResult> {
  const schedules = schedulesDueToday(now)
  const configs = await prisma.reportConfig.findMany({
    where: { schedule: { in: schedules } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  const runs: SweepResult["runs"] = []
  // Sequential on purpose: these are heavy queries against the same database
  // the console is serving, and ten at once would be felt by everyone using it.
  for (const config of configs) {
    const outcome = await executeReport(config.id, "schedule")
    runs.push({
      configId: config.id,
      name: config.name,
      status: outcome.status,
      rows: outcome.rows,
      error: outcome.error,
    })
  }

  return {
    due: configs.length,
    succeeded: runs.filter((run) => run.status === "SUCCEEDED").length,
    failed: runs.filter((run) => run.status === "FAILED").length,
    schedules,
    runs,
  }
}
