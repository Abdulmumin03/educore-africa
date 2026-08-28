import type { Metadata } from "next"

import { PageHeader } from "@/components/shared/page-header"
import { SLA_TARGETS, slaDashboard } from "@/lib/support"
import { requireRole } from "@/lib/session"
import { cn, formatNumber } from "@/lib/utils"
import { SupportNav } from "../support-nav"

export const metadata: Metadata = { title: "SLA Dashboard" }
export const dynamic = "force-dynamic"

const HOUR = 3_600_000

function duration(ms: number | null): string {
  if (ms === null) return "—"
  const hours = ms / HOUR
  if (hours >= 24) return `${(hours / 24).toFixed(1)}d`
  if (hours >= 1) return `${hours.toFixed(1)}h`
  return `${Math.round(ms / 60_000)}m`
}

function Panel({
  title,
  subtitle,
  children,
  className,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("rounded-lg border border-sa-border bg-sa-surface", className)}>
      <header className="border-b border-sa-border px-4 py-2.5">
        <h2 className="text-h3">{title}</h2>
        {subtitle && <p className="text-caption text-sa-dim">{subtitle}</p>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

const STATUS_COLOUR: Record<string, string> = {
  OPEN: "#3B82F6",
  IN_PROGRESS: "#8B5CF6",
  WAITING_ON_CLIENT: "#D97706",
  RESOLVED: "#0D9488",
  CLOSED: "#475569",
}

export default async function SlaPage({ searchParams }: { searchParams: { days?: string } }) {
  await requireRole("SUPPORT_ADMIN", "BUSINESS_ADMIN")

  const days = Math.min(90, Math.max(7, Number(searchParams.days ?? 14) || 14))
  const data = await slaDashboard(days)

  const maxDay = data.byDay.reduce((max, row) => {
    const total = ["OPEN", "IN_PROGRESS", "WAITING_ON_CLIENT", "RESOLVED", "CLOSED"].reduce(
      (sum, key) => sum + Number(row[key] ?? 0),
      0,
    )
    return Math.max(max, total)
  }, 0)

  return (
    <>
      <PageHeader
        title="SLA dashboard"
        description={`Tickets opened in the last ${data.windowDays} days`}
      />

      <SupportNav />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel title="SLA compliance">
          <p
            className={cn(
              "font-mono text-display tabular-nums",
              data.compliancePercent === null
                ? "text-sa-disabled"
                : data.compliancePercent >= 90
                  ? "text-sa-green"
                  : data.compliancePercent >= 75
                    ? "text-sa-amber"
                    : "text-sa-red",
            )}
          >
            {data.compliancePercent === null ? "—" : `${data.compliancePercent.toFixed(1)}%`}
          </p>
          <p className="mt-1 text-caption text-sa-dim">
            {formatNumber(data.totals.tickets)} ticket{data.totals.tickets === 1 ? "" : "s"} judged
          </p>
        </Panel>

        <Panel title="Avg first response">
          <p className="font-mono text-display tabular-nums text-sa-text">
            {duration(data.avgFirstResponseMs)}
          </p>
          <p className="mt-1 text-caption text-sa-dim">
            {formatNumber(data.totals.responded)} of {formatNumber(data.totals.tickets)} answered
          </p>
        </Panel>

        <Panel title="Avg resolution">
          <p className="font-mono text-display tabular-nums text-sa-text">
            {duration(data.avgResolutionMs)}
          </p>
          <p className="mt-1 text-caption text-sa-dim">
            {formatNumber(data.totals.resolved)} resolved
          </p>
        </Panel>

        <Panel title="Breached this week">
          <p
            className={cn(
              "font-mono text-display tabular-nums",
              data.breachedThisWeek > 0 ? "text-sa-red" : "text-sa-green",
            )}
          >
            {formatNumber(data.breachedThisWeek)}
          </p>
          <p className="mt-1 text-caption text-sa-dim">Past target, opened in the last 7 days</p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel title="Tickets by day" subtitle="Stacked by status at time of reading">
          {maxDay === 0 ? (
            <p className="text-body text-sa-dim">No tickets opened in this window.</p>
          ) : (
            <>
              <div className="flex items-end gap-1" style={{ height: 180 }}>
                {data.byDay.map((row) => (
                  <div key={row.day} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-col-reverse justify-start" style={{ height: 150 }}>
                      {["OPEN", "IN_PROGRESS", "WAITING_ON_CLIENT", "RESOLVED", "CLOSED"].map((key) => {
                        const value = Number(row[key] ?? 0)
                        if (value === 0) return null
                        return (
                          <div
                            key={key}
                            title={`${row.label} · ${key.replace(/_/g, " ").toLowerCase()}: ${value}`}
                            // 2px of surface between segments so adjacent bands
                            // never bleed into one another.
                            className="w-full border-b-2 border-sa-surface first:rounded-t"
                            style={{
                              height: `${(value / maxDay) * 148}px`,
                              backgroundColor: STATUS_COLOUR[key],
                            }}
                          />
                        )
                      })}
                    </div>
                    <span className="font-mono text-[9px] tabular-nums text-sa-dim">
                      {row.label.split(" ")[0]}
                    </span>
                  </div>
                ))}
              </div>

              <ul className="mt-3 flex flex-wrap gap-3">
                {Object.entries(STATUS_COLOUR).map(([key, colour]) => (
                  <li key={key} className="inline-flex items-center gap-1.5 text-caption text-sa-dim">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colour }} />
                    {key.replace(/_/g, " ").toLowerCase()}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Panel title="Targets" subtitle="Policy, not data — a change is a reviewable diff">
          <table className="w-full text-body">
            <thead>
              <tr className="text-caption uppercase tracking-wide text-sa-dim">
                <th scope="col" className="pb-1.5 text-left font-medium">
                  Priority
                </th>
                <th scope="col" className="pb-1.5 text-right font-medium">
                  First reply
                </th>
                <th scope="col" className="pb-1.5 text-right font-medium">
                  Resolution
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(SLA_TARGETS).map(([priority, target]) => (
                <tr key={priority} className="border-t border-sa-border/60">
                  <td className="py-1.5 text-sa-text">
                    {priority.charAt(0) + priority.slice(1).toLowerCase()}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-sa-muted">
                    {target.firstResponse}h
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-sa-muted">
                    {target.resolution}h
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel
          title="Agent performance"
          subtitle={
            data.csatAvailable
              ? undefined
              : "CSAT is absent, not zero: tickets carry no satisfaction survey, so there is nothing to average."
          }
        >
          {data.leaderboard.length === 0 ? (
            <p className="text-body text-sa-dim">No tickets were assigned in this window.</p>
          ) : (
            <table className="w-full text-body">
              <thead>
                <tr className="text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="pb-1.5 text-left font-medium">
                    Agent
                  </th>
                  <th scope="col" className="pb-1.5 text-right font-medium">
                    Assigned
                  </th>
                  <th scope="col" className="pb-1.5 text-right font-medium">
                    Resolved
                  </th>
                  <th scope="col" className="pb-1.5 text-right font-medium">
                    Avg resolution
                  </th>
                  <th scope="col" className="pb-1.5 text-right font-medium">
                    Breached
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboard.map((agent) => (
                  <tr key={agent.id} className="border-t border-sa-border/60">
                    <td className="py-1.5 text-sa-text">
                      {agent.name}
                      <span className="ml-2 text-caption text-sa-dim">
                        {agent.role.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-sa-muted">
                      {agent.assigned}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-sa-text">
                      {agent.resolved}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-sa-muted">
                      {duration(agent.avgResolutionMs)}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 text-right font-mono tabular-nums",
                        agent.breached > 0 ? "text-sa-red" : "text-sa-dim",
                      )}
                    >
                      {agent.breached}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  )
}
