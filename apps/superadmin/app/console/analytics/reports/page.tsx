import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/shared/page-header"
import { prisma } from "@/lib/db"
import { MAX_ROWS, SOURCES } from "@/lib/reports"
import { requireRole } from "@/lib/session"
import { ReportsClient, type SavedReport } from "./reports-client"
import type { SourceMeta } from "./report-builder"

export const metadata: Metadata = { title: "Reports" }
export const dynamic = "force-dynamic"

export default async function ReportsPage() {
  const me = await requireRole("ANALYTICS_ADMIN", "BUSINESS_ADMIN", "FINANCE_ADMIN")

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

  const reports: SavedReport[] = configs.map((config) => ({
    id: config.id,
    name: config.name,
    description: config.description,
    source: config.source,
    fields: config.fields,
    schedule: config.schedule,
    recipients: config.recipients,
    createdBy: names.get(config.createdById) ?? "Unknown",
    createdById: config.createdById,
    lastRunAt: config.lastRunAt?.toISOString() ?? null,
    lastRun: config.runs[0]
      ? { ...config.runs[0], startedAt: config.runs[0].startedAt.toISOString() }
      : null,
  }))

  const sources: SourceMeta[] = SOURCES.map((source) => ({
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
  }))

  return (
    <>
      <PageHeader
        title="Reports"
        description="Saved queries over any console data source, exportable as Excel or CSV and deliverable on a schedule."
        action={
          <Link
            href="/console/analytics"
            className="inline-flex h-8 items-center rounded-md border border-sa-border px-3 text-body text-sa-muted transition-colors hover:text-sa-text"
          >
            Back to Analytics
          </Link>
        }
      />

      <ReportsClient
        initial={reports}
        sources={sources}
        maxRows={MAX_ROWS}
        currentUserId={me.id}
        isOwner={me.role === "SUPER_ADMIN"}
      />
    </>
  )
}
