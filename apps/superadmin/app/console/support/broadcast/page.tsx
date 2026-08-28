import type { Metadata } from "next"

import { PageHeader } from "@/components/shared/page-header"
import { listBroadcasts } from "@/lib/broadcast"
import { prisma } from "@/lib/db"
import { PLAN_LABEL, PLAN_ORDER, STATUS_LABEL, STATUS_ORDER } from "@/lib/plans"
import { requireRole } from "@/lib/session"
import { formatNumber } from "@/lib/utils"
import { SupportNav } from "../support-nav"
import { BroadcastComposer } from "./broadcast-composer"

export const metadata: Metadata = { title: "Broadcast" }
export const dynamic = "force-dynamic"

export default async function BroadcastPage() {
  await requireRole("BUSINESS_ADMIN")

  const [planCounts, stateRows, statusCounts, schools, history] = await Promise.all([
    prisma.schoolSubscription.groupBy({
      by: ["plan"],
      where: { school: { deletedAt: null } },
      _count: { _all: true },
    }),
    prisma.school.groupBy({
      by: ["state"],
      where: { deletedAt: null, state: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.schoolSubscription.groupBy({
      by: ["status"],
      where: { school: { deletedAt: null } },
      _count: { _all: true },
    }),
    prisma.school.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listBroadcasts(10),
  ])

  const planLookup = new Map(planCounts.map((row) => [row.plan, row._count._all]))
  const statusLookup = new Map(statusCounts.map((row) => [row.status, row._count._all]))

  return (
    <>
      <PageHeader
        title="Broadcast"
        description="Reaches school administrators and principals. The console dispatches the in-app inbox; SMS and email belong to the school app's senders."
      />

      <SupportNav />

      <BroadcastComposer
        plans={PLAN_ORDER.map((plan) => ({
          value: plan,
          label: PLAN_LABEL[plan],
          count: planLookup.get(plan) ?? 0,
        }))}
        states={stateRows
          .filter((row): row is typeof row & { state: string } => row.state !== null)
          .map((row) => ({ value: row.state, count: row._count._all }))}
        statuses={STATUS_ORDER.map((status) => ({
          value: status,
          label: STATUS_LABEL[status],
          count: statusLookup.get(status) ?? 0,
        }))}
        schools={schools}
      />

      <section className="mt-4 rounded-lg border border-sa-border bg-sa-surface">
        <header className="border-b border-sa-border px-4 py-2.5">
          <h2 className="text-h3">Recent broadcasts</h2>
        </header>

        {history.length === 0 ? (
          <p className="px-4 py-8 text-center text-body text-sa-muted">Nothing has been broadcast yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Title
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Audience
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Channels
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Schools
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    In-app sent
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Sent by
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    When
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-b border-sa-border/60 last:border-0">
                    <td className="px-4 py-2 text-sa-text">{row.title}</td>
                    <td className="px-3 py-2 text-caption text-sa-muted">
                      {row.audience.replace(/_/g, " ").toLowerCase()}
                    </td>
                    <td className="px-3 py-2 text-caption text-sa-muted">{row.channels.join(", ")}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-sa-muted">
                      {formatNumber(row.schoolCount)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-sa-text">
                      {formatNumber(row.inAppSent)}
                    </td>
                    <td className="px-3 py-2 text-caption text-sa-muted">{row.createdBy}</td>
                    <td className="px-3 py-2 text-right font-mono text-caption tabular-nums text-sa-dim">
                      {row.sentAt ? new Date(row.sentAt).toLocaleString("en-GB") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
