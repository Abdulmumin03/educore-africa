import { NextResponse } from "next/server"
import type { ReportSchedule, ReportSource } from "@prisma/client"

import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { MAX_ROWS, SOURCES, getSource, type Filter } from "@/lib/reports"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const SCHEDULES = ["NONE", "DAILY", "WEEKLY", "MONTHLY"]
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const [configs, authors] = await Promise.all([
    prisma.reportConfig.findMany({
      orderBy: [{ schedule: "asc" }, { name: "asc" }],
      include: {
        runs: {
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { id: true, status: true, rows: true, startedAt: true, downloadUrl: true, error: true },
        },
      },
    }),
    prisma.superAdminUser.findMany({ select: { id: true, name: true } }),
  ])
  const names = new Map(authors.map((author) => [author.id, author.name]))

  return NextResponse.json({
    reports: configs.map((config) => ({
      id: config.id,
      name: config.name,
      description: config.description,
      source: config.source,
      fields: config.fields,
      filters: config.filters,
      sortField: config.sortField,
      sortDir: config.sortDir,
      rowLimit: config.rowLimit,
      schedule: config.schedule,
      recipients: config.recipients,
      createdBy: names.get(config.createdById) ?? "Unknown",
      createdById: config.createdById,
      lastRunAt: config.lastRunAt?.toISOString() ?? null,
      lastRun: config.runs[0]
        ? {
            ...config.runs[0],
            startedAt: config.runs[0].startedAt.toISOString(),
          }
        : null,
    })),
    // The catalogue travels with the list so the builder never has to guess
    // which fields exist.
    sources: SOURCES.map((source) => ({
      key: source.key,
      label: source.label,
      description: source.description,
      defaultFields: source.defaultFields,
      defaultSort: source.defaultSort,
      fields: source.fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        options: field.options,
        advanced: field.advanced ?? false,
      })),
    })),
    maxRows: MAX_ROWS,
  })
}

function validate(body: Record<string, unknown>):
  | { ok: true; data: {
      name: string
      description: string | null
      source: ReportSource
      fields: string[]
      filters: Filter[]
      sortField: string | null
      sortDir: string
      rowLimit: number | null
      schedule: ReportSchedule
      recipients: string[]
    } }
  | { ok: false; error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) return { ok: false, error: "Give the report a name." }

  const source = getSource(typeof body.source === "string" ? body.source : "")
  if (!source) return { ok: false, error: "Pick a data source." }

  const known = new Set(source.fields.map((field) => field.key))
  const fields = Array.isArray(body.fields)
    ? body.fields.filter((key): key is string => typeof key === "string" && known.has(key))
    : []
  if (fields.length === 0) return { ok: false, error: "Pick at least one field." }

  const filters: Filter[] = Array.isArray(body.filters)
    ? body.filters
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
          field: String(entry.field ?? ""),
          operator: String(entry.operator ?? ""),
          value: entry.value,
        }))
    : []
  for (const filter of filters) {
    if (!known.has(filter.field)) {
      return { ok: false, error: `Unknown filter field "${filter.field}".` }
    }
  }

  const sortField =
    typeof body.sortField === "string" && known.has(body.sortField) ? body.sortField : null

  const schedule =
    typeof body.schedule === "string" && SCHEDULES.includes(body.schedule)
      ? (body.schedule as ReportSchedule)
      : "NONE"

  const recipients = Array.isArray(body.recipients)
    ? [...new Set(body.recipients.filter((value): value is string => typeof value === "string").map((v) => v.trim().toLowerCase()).filter(Boolean))]
    : []
  const bad = recipients.find((address) => !EMAIL.test(address))
  if (bad) return { ok: false, error: `"${bad}" is not a valid email address.` }

  // A schedule with nowhere to deliver produces a file nobody is told about.
  if (schedule !== "NONE" && recipients.length === 0) {
    return {
      ok: false,
      error: "A scheduled report needs at least one recipient — otherwise nothing tells anyone it ran.",
    }
  }

  const rowLimit =
    body.rowLimit === null || body.rowLimit === undefined || body.rowLimit === ""
      ? null
      : Math.min(MAX_ROWS, Math.max(1, Math.round(Number(body.rowLimit)) || 0)) || null

  return {
    ok: true,
    data: {
      name,
      description: typeof body.description === "string" ? body.description.trim() || null : null,
      source: source.key,
      fields,
      filters,
      sortField,
      sortDir: body.sortDir === "asc" ? "asc" : "desc",
      rowLimit,
      schedule,
      recipients,
    },
  }
}

export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "BUSINESS_ADMIN", "ANALYTICS_ADMIN", "FINANCE_ADMIN")
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const checked = validate(body)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

  const report = await prisma.reportConfig.create({
    data: {
      ...checked.data,
      filters: checked.data.filters as never,
      createdById: guard.user.id,
    },
    select: { id: true, name: true, schedule: true },
  })

  await auditLog({
    userId: guard.user.id,
    action: "report.create",
    target: auditTarget("config", `report:${report.id}`),
    targetType: "config",
    ipAddress: guard.ipAddress,
    details: {
      name: report.name,
      source: checked.data.source,
      schedule: report.schedule,
      recipients: checked.data.recipients.length,
    },
  })

  return NextResponse.json({ report }, { status: 201 })
}
