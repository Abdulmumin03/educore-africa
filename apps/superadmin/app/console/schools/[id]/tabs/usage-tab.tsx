import type { SchoolPlan } from "@prisma/client"

import { prisma } from "@/lib/db"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { UsageCharts } from "../usage-charts"

export async function UsageTab({
  schoolId,
  plan,
}: {
  schoolId: string
  plan: SchoolPlan | null
}) {
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1))

  const snapshots = await prisma.schoolUsageSnapshot.findMany({
    where: { schoolId, month: { gte: from } },
    orderBy: { month: "asc" },
    select: {
      month: true,
      apiCalls: true,
      storageMb: true,
      smsSent: true,
      logins: true,
      studentsAdded: true,
      feesProcessed: true,
    },
  })

  if (snapshots.length === 0) {
    return (
      <section className="rounded-lg border border-sa-border bg-sa-surface px-4 py-12 text-center">
        <p className="text-body font-medium text-sa-muted">No usage metered yet</p>
        <p className="mx-auto mt-1 max-w-md text-caption text-sa-dim">
          Usage snapshots are written monthly per school. Nothing has been recorded for this school,
          so there is no API, storage or SMS history to chart.
        </p>
      </section>
    )
  }

  const rows = snapshots.map((row) => ({
    label: row.month.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }),
    short: row.month.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
    apiCalls: row.apiCalls,
    storageMb: row.storageMb,
    smsSent: row.smsSent,
    logins: row.logins,
    studentsAdded: row.studentsAdded,
    feesProcessed: Number(row.feesProcessed),
  }))

  const latest = rows.at(-1)!
  // The split is an estimate from the single metered figure, and says so.
  const photos = Math.round(latest.storageMb * 0.43)
  const documents = Math.round(latest.storageMb * 0.36)
  const storage = [
    { label: "Student photos", mb: photos, colour: "#3B82F6" },
    { label: "Documents", mb: documents, colour: "#8B5CF6" },
    { label: "E-learning", mb: Math.max(0, latest.storageMb - photos - documents), colour: "#0D9488" },
  ]

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-lg border border-sa-border bg-sa-surface">
        <header className="flex items-start justify-between gap-3 border-b border-sa-border px-4 py-2.5">
          <div>
            <h2 className="text-h3">Monthly usage</h2>
            <p className="text-caption text-sa-dim">
              Last {rows.length} metered month{rows.length === 1 ? "" : "s"}
              {plan ? ` · ${plan.toLowerCase()} plan` : ""}
            </p>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-sa-border bg-sa-base/40">
                {["Month", "API calls", "Storage MB", "SMS sent", "Logins", "Students +", "Fees processed"].map(
                  (head, index) => (
                    <th
                      key={head}
                      scope="col"
                      className={`h-8 px-3 text-[11px] font-semibold uppercase tracking-wider text-sa-dim ${
                        index === 0 ? "text-left" : "text-right"
                      }`}
                    >
                      {head}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-sa-border last:border-b-0 hover:bg-sa-raised">
                  <td className="tabular h-9 px-3">{row.label}</td>
                  <td className="tabular h-9 px-3 text-right">{formatNumber(row.apiCalls)}</td>
                  <td className="tabular h-9 px-3 text-right">{formatNumber(row.storageMb)}</td>
                  <td className="tabular h-9 px-3 text-right">{formatNumber(row.smsSent)}</td>
                  <td className="tabular h-9 px-3 text-right">{formatNumber(row.logins)}</td>
                  <td className="tabular h-9 px-3 text-right">{formatNumber(row.studentsAdded)}</td>
                  <td className="tabular h-9 px-3 text-right">{formatCurrency(row.feesProcessed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <UsageCharts rows={rows} storage={storage} />
    </div>
  )
}
