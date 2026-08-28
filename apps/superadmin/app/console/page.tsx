import { headers } from "next/headers"
import Link from "next/link"

import { GrowthChart } from "@/components/charts/growth-chart"
import { StateChoropleth } from "@/components/charts/state-choropleth"
import { SubscriptionMix } from "@/components/charts/subscription-mix"
import { ActivityFeed } from "@/components/shared/activity-feed"
import { AiSnapshot, type Snapshot } from "@/components/shared/ai-snapshot"
import { AlertsPanel } from "@/components/shared/alerts-panel"
import { MetricCard } from "@/components/shared/metric-card"
import { Opportunities } from "@/components/shared/opportunities"
import { PageHeader } from "@/components/shared/page-header"
import { getAlerts } from "@/lib/alerts"
import { latestGrowthBatch } from "@/lib/growth-ai"
import { prisma } from "@/lib/db"
import {
  computeGrowthTrend,
  getPlatformMetrics,
  getRevenueBreakdown,
  weeklySeries,
} from "@/lib/metrics"
import { PLAN_COLOUR, PLAN_LABEL } from "@/lib/plans"
import { requireConsoleUser } from "@/lib/session"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"

export const dynamic = "force-dynamic"

function Panel({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("rounded-lg border border-sa-border bg-sa-surface", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-sa-border px-4 py-2.5">
        <div>
          <h2 className="text-h3">{title}</h2>
          {subtitle && <p className="text-caption text-sa-dim">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

/**
 * The snapshot is fetched over HTTP rather than by calling the route's
 * handler, because it is the one panel with a 6-hour cache the client can
 * also refresh — going through the same endpoint keeps one cache, not two.
 */
async function loadSnapshot(): Promise<Snapshot | null> {
  try {
    const host = headers().get("host")
    const proto = headers().get("x-forwarded-proto") ?? "http"
    const response = await fetch(`${proto}://${host}/api/ai/business-snapshot`, {
      headers: { cookie: headers().get("cookie") ?? "" },
      cache: "no-store",
    })
    if (!response.ok) return null
    return (await response.json()) as Snapshot
  } catch {
    return null
  }
}

export default async function CommandCentrePage() {
  const user = await requireConsoleUser()

  const [
    metrics,
    growth,
    revenue,
    alerts,
    statesGrouped,
    snapshot,
    schoolSeries,
    studentSeries,
    opportunities,
  ] = await Promise.all([
    getPlatformMetrics(),
    computeGrowthTrend(),
    getRevenueBreakdown(),
    getAlerts(),
    prisma.school.groupBy({
      by: ["state"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    loadSnapshot(),
    weeklySeries("schools"),
    weeklySeries("students"),
    latestGrowthBatch(),
  ])

  // A recommendation batch has a shelf life: the figures behind it move every
  // week, so an older one is labelled rather than shown as if it were current.
  const opportunityAge = opportunities
    ? Math.floor((Date.now() - new Date(opportunities.generatedAt).getTime()) / 86_400_000)
    : null

  // Signup counts for the last 8 months drive the "new this month" sparkline.
  const signupSeries = growth.slice(-8).map((month) => month.signups)

  const mrrByState = new Map(revenue.byState.map((row) => [row.state, row]))
  const states = statesGrouped
    .map((row) => {
      const state = row.state?.trim() || "Unspecified"
      const match = mrrByState.get(state)
      return {
        state,
        schools: row._count._all,
        mrr: match?.mrr ?? 0,
        topPlan: match?.topPlan ?? null,
      }
    })
    .sort((a, b) => b.schools - a.schools)
  const maxSchools = states.reduce((max, row) => Math.max(max, row.schools), 0)

  const totalPlanSchools = revenue.byPlan.reduce((sum, row) => sum + row.schools, 0)
  const mix = revenue.byPlan.map((row) => ({
    ...row,
    schoolShare: totalPlanSchools > 0 ? (row.schools / totalPlanSchools) * 100 : 0,
  }))

  return (
    <>
      <PageHeader
        title={`Good day, ${user.name.split(" ")[0]}`}
        description={`${formatNumber(metrics.totalSchools)} schools · ${formatNumber(
          metrics.totalStudents,
        )} students · updated ${new Date(metrics.computedAt).toLocaleTimeString("en-NG")}`}
      />

      {/* ROW 1 — KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label="Active schools"
          value={formatNumber(metrics.activeSchools)}
          trend={metrics.trends.activeSchools ?? undefined}
          subLabel={`of ${formatNumber(metrics.totalSchools)} · 30-day logins`}
          sparkline={schoolSeries}
        />
        <MetricCard
          label="Total students"
          value={formatNumber(metrics.totalStudents)}
          trend={metrics.trends.totalStudents ?? undefined}
          subLabel="vs last month"
          sparkline={studentSeries}
        />
        <MetricCard
          label="MRR"
          value={formatCurrency(metrics.mrr)}
          trend={metrics.trends.mrr ?? undefined}
          subLabel="vs last month"
        />
        <MetricCard
          label="ARR"
          value={formatCurrency(metrics.arr)}
          trend={metrics.trends.mrr ?? undefined}
          subLabel="run rate"
        />
        <MetricCard
          label="New this month"
          value={formatNumber(metrics.newSignups)}
          trend={metrics.trends.newSignups ?? undefined}
          subLabel={`${metrics.churned} churned`}
          sparkline={signupSeries}
        />
        <MetricCard
          label="Platform uptime"
          value={`${metrics.uptimePercent.toFixed(2)}%`}
          subLabel="30-day rolling · SLA 99.9%"
        />
      </div>

      {/* ROW 2 — growth + mix */}
      <div className="mt-5 grid gap-4 xl:grid-cols-5">
        <Panel
          title="Monthly growth"
          subtitle="New signups vs churn · schools per month · last 12 months"
          className="xl:col-span-3"
          action={
            <div className="flex shrink-0 items-center gap-3.5">
              <span className="inline-flex items-center gap-1.5 text-caption text-sa-muted">
                <span className="h-2.5 w-2.5 rounded-sm bg-sa-blue" aria-hidden="true" />
                New signups
              </span>
              <span className="inline-flex items-center gap-1.5 text-caption text-sa-muted">
                <span className="h-0.5 w-3.5 rounded-sm bg-sa-red" aria-hidden="true" />
                Churn
              </span>
            </div>
          }
        >
          <div className="px-2 pb-3 pt-4">
            <GrowthChart data={growth} />
            <p className="px-2 pt-1 text-caption text-sa-dim">
              Both series are schools per month, so they share one axis — the gap between them is
              the net add.
            </p>
          </div>
        </Panel>

        <Panel
          title="Subscription mix"
          subtitle={`${formatNumber(totalPlanSchools)} paying schools across ${mix.filter((m) => m.schools > 0).length} plans`}
          className="xl:col-span-2"
        >
          <div className="p-4">
            <SubscriptionMix slices={mix} totalSchools={totalPlanSchools} />
          </div>
        </Panel>
      </div>

      {/* ROW 3 — geography + revenue by plan */}
      <div className="mt-5 grid gap-4 xl:grid-cols-[11fr_9fr]">
        <Panel
          title="Schools by state"
          subtitle="One tile per state, positioned roughly geographically"
          className=""
        >
          <div className="p-4">
            <StateChoropleth data={states} maxSchools={maxSchools} />
          </div>
        </Panel>

        <Panel
          title="Revenue by plan"
          subtitle="This month · NGN"
          className=""
          action={
            <span className="tabular shrink-0 text-h3">{formatCurrency(revenue.totalMrr)}</span>
          }
        >
          <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] items-center gap-3 border-b border-sa-border bg-sa-base/40 px-4 py-2">
            {["Plan", "Schools", "MRR", "vs last"].map((head, index) => (
              <span
                key={head}
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-wider text-sa-dim",
                  index > 0 && "text-right",
                )}
              >
                {head}
              </span>
            ))}
          </div>
          {revenue.byPlan.map((row) => (
            <div
              key={row.plan}
              className="grid grid-cols-[1.5fr_1fr_1fr_1fr] items-center gap-3 border-b border-sa-border px-4 py-2 last:border-b-0"
            >
              <span className="inline-flex items-center gap-2 text-body">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ background: PLAN_COLOUR[row.plan] }}
                  aria-hidden="true"
                />
                {PLAN_LABEL[row.plan]}
              </span>
              <span className="tabular text-right text-sa-muted">{formatNumber(row.schools)}</span>
              <span className="tabular text-right">{formatCurrency(row.mrr)}</span>
              <span
                className={cn(
                  "tabular text-right",
                  row.changePercent === null
                    ? "text-sa-dim"
                    : row.changePercent >= 0
                      ? "text-sa-green"
                      : "text-sa-red",
                )}
              >
                {row.changePercent === null
                  ? "—"
                  : `${row.changePercent >= 0 ? "+" : ""}${row.changePercent.toFixed(1)}%`}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-caption text-sa-dim">
              Monthly-equivalent — termly and annual plans are normalised.
            </span>
            <Link href="/console/revenue" className="text-caption text-sa-blue">
              Open revenue →
            </Link>
          </div>
        </Panel>
      </div>

      {/* ROW 4 — alerts + live feed */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Action required"
          subtitle={
            alerts.length === 0
              ? "All clear"
              : `${alerts.filter((a) => a.severity === "critical").length} critical · ${alerts.length} total`
          }
        >
          <AlertsPanel alerts={alerts} />
        </Panel>

        <section className="rounded-lg border border-sa-border bg-sa-surface">
          <ActivityFeed />
        </section>
      </div>

      {/* ROW 5 — growth recommendations */}
      <div className="mt-5">
        <Opportunities
          initial={opportunities}
          ageDays={opportunityAge}
          stale={opportunityAge !== null && opportunityAge > 9}
          canRun={user.role === "BUSINESS_ADMIN" || user.role === "SALES_ADMIN"}
        />
      </div>

      {/* ROW 6 — AI snapshot */}
      <div className="mt-5">
        {snapshot ? (
          <AiSnapshot initial={snapshot} />
        ) : (
          <div className="rounded-lg border border-sa-border bg-sa-surface p-4 text-body text-sa-dim">
            The business snapshot could not be generated. Check that Redis and the database are
            reachable.
          </div>
        )}
      </div>
    </>
  )
}
