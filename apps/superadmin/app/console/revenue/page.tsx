import type { Metadata } from "next"
import Link from "next/link"

import { ChurnChart } from "@/components/charts/churn-chart"
import { RevenueAreaChart } from "@/components/charts/revenue-area-chart"
import { MetricCard } from "@/components/shared/metric-card"
import { PageHeader } from "@/components/shared/page-header"
import { PLAN_COLOUR, PLAN_LABEL } from "@/lib/plans"
import { churnAnalysis, resolveRange, revenueByPeriod, revenueByState, revenueKpis } from "@/lib/revenue"
import { requireRole } from "@/lib/session"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"
import { DateRangePicker } from "./date-range"
import { ForecastPanel } from "./forecast-panel"
import { RevenueNav } from "./revenue-nav"

export const metadata: Metadata = { title: "Revenue Intelligence" }
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

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: { preset?: string; from?: string; to?: string }
}) {
  await requireRole("BUSINESS_ADMIN", "FINANCE_ADMIN", "ANALYTICS_ADMIN")

  const preset = searchParams.preset ?? "mtd"
  const range = resolveRange(preset, searchParams.from, searchParams.to)
  // The stacked area always shows twelve months — a one-month range would
  // make a single-point area chart, which says nothing.
  const chartRange = resolveRange("12m")

  const [kpis, series, states, churn] = await Promise.all([
    revenueKpis(range),
    revenueByPeriod(chartRange, "monthly"),
    revenueByState(10),
    churnAnalysis(chartRange),
  ])

  const rangeLabel = `${range.from.toLocaleDateString("en-GB")} – ${range.to.toLocaleDateString("en-GB")}`

  return (
    <>
      <PageHeader
        title="Revenue Intelligence"
        description={`${formatNumber(kpis.payingSchools)} paying schools · all amounts NGN`}
        action={
          <Link
            href="/api/revenue/transactions/export"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90"
          >
            Export report
          </Link>
        }
      />

      <RevenueNav />

      <div className="mb-4">
        <DateRangePicker preset={preset} from={searchParams.from} to={searchParams.to} />
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="MRR"
          value={formatCurrency(kpis.mrr)}
          trend={kpis.changes.mrr ?? undefined}
          subLabel="vs range start"
        />
        <MetricCard label="ARR" value={formatCurrency(kpis.arr)} subLabel="MRR × 12" />
        <MetricCard
          label="Revenue (period)"
          value={formatCurrency(kpis.periodRevenue)}
          trend={kpis.changes.periodRevenue ?? undefined}
          subLabel={rangeLabel}
        />
        <MetricCard
          label="Avg / school"
          value={formatCurrency(kpis.avgPerSchool)}
          subLabel={`across ${formatNumber(kpis.payingSchools)} paying`}
        />
        <MetricCard
          label="Net revenue retention"
          value={kpis.nrr === null ? "—" : `${kpis.nrr.toFixed(1)}%`}
          subLabel={
            kpis.nrrBreakdown
              ? `${formatNumber(kpis.nrrBreakdown.cohortSize)} schools at range start`
              : "No cohort at range start"
          }
        />
      </div>

      {kpis.nrrBreakdown && (
        <p className="mt-2 text-caption text-sa-dim">
          NRR movement: expansion{" "}
          <span className="tabular text-sa-green">+{formatCurrency(kpis.nrrBreakdown.expansion)}</span>,
          contraction{" "}
          <span className="tabular text-sa-amber">−{formatCurrency(kpis.nrrBreakdown.contraction)}</span>,
          churn <span className="tabular text-sa-red">−{formatCurrency(kpis.nrrBreakdown.churned)}</span>{" "}
          against a starting {formatCurrency(kpis.nrrBreakdown.startingMrr)}. Movements are read from
          subscription revision history, which only starts from SA-06 — earlier price changes are
          invisible to it.
        </p>
      )}

      {/* Stacked area */}
      <div className="mt-5">
        <Panel
          title="Revenue by plan tier"
          subtitle="Monthly recurring revenue at each month end · last 12 months"
          action={
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              {(Object.keys(PLAN_LABEL) as Array<keyof typeof PLAN_LABEL>).map((plan) => (
                <span key={plan} className="inline-flex items-center gap-1.5 text-caption text-sa-muted">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ background: PLAN_COLOUR[plan] }}
                    aria-hidden="true"
                  />
                  {PLAN_LABEL[plan]}
                </span>
              ))}
            </div>
          }
        >
          <div className="px-2 py-4">
            <RevenueAreaChart data={series} />
          </div>
        </Panel>
      </div>

      {/* States + churn */}
      <div className="mt-5 grid gap-4 xl:grid-cols-[11fr_9fr]">
        <Panel
          title="Revenue by state"
          subtitle={`Top ${states.rows.length} of ${states.totalStates} · sorted by MRR`}
          action={<span className="tabular shrink-0 text-h3">{formatCurrency(states.shownMrr)}</span>}
        >
          <div className="grid grid-cols-[1.3fr_.8fr_1.2fr_.8fr_1.2fr] items-center gap-3 border-b border-sa-border bg-sa-base/40 px-4 py-2">
            {["State", "Schools", "MRR", "Share", "Top plan"].map((head, index) => (
              <span
                key={head}
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-wider text-sa-dim",
                  index > 0 && index < 4 && "text-right",
                )}
              >
                {head}
              </span>
            ))}
          </div>
          {states.rows.map((row) => (
            <div
              key={row.state}
              className="grid grid-cols-[1.3fr_.8fr_1.2fr_.8fr_1.2fr] items-center gap-3 border-b border-sa-border px-4 py-2 last:border-b-0"
            >
              <span>{row.state}</span>
              <span className="tabular text-right text-sa-muted">{formatNumber(row.schools)}</span>
              <span className="tabular text-right">{formatCurrency(row.mrr)}</span>
              <span className="tabular text-right text-sa-muted">{row.share.toFixed(1)}%</span>
              <span className="inline-flex items-center gap-2 text-sa-muted">
                {row.topPlan && (
                  <span
                    className="h-1.5 w-1.5 rounded-sm"
                    style={{ background: PLAN_COLOUR[row.topPlan] }}
                    aria-hidden="true"
                  />
                )}
                {row.topPlan ? PLAN_LABEL[row.topPlan] : "—"}
              </span>
            </div>
          ))}
          {states.rows.length === 0 && (
            <p className="px-4 py-10 text-center text-body text-sa-dim">No subscription revenue yet.</p>
          )}
          <p className="px-4 py-2.5 text-caption text-sa-dim">
            These {states.rows.length} states carry{" "}
            <span className="tabular text-sa-muted">
              {states.totalMrr > 0 ? ((states.shownMrr / states.totalMrr) * 100).toFixed(1) : "0.0"}%
            </span>{" "}
            of platform MRR.
          </p>
        </Panel>

        <Panel
          title="Churn analysis"
          subtitle={`${churn.totalChurned} schools lost over 12 months`}
          action={
            <div className="flex shrink-0 items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-caption text-sa-muted">
                <span className="h-2.5 w-2.5 rounded-sm bg-sa-red" aria-hidden="true" />
                Churned
              </span>
              <span className="inline-flex items-center gap-1.5 text-caption text-sa-muted">
                <span className="h-0.5 w-3.5 rounded-sm bg-sa-amber" aria-hidden="true" />
                Rate %
              </span>
            </div>
          }
        >
          <div className="px-2 pt-4">
            <ChurnChart data={churn.months} />
          </div>
          <p className="px-4 pt-2 text-[11px] font-semibold uppercase tracking-wider text-sa-dim">
            Recent churns
          </p>
          {churn.recent.length === 0 && (
            <p className="px-4 py-6 text-center text-body text-sa-dim">No churn in this window.</p>
          )}
          {churn.recent.map((row) => (
            <div
              key={row.schoolId}
              className="flex items-center gap-3 border-b border-sa-border px-4 py-2 last:border-b-0"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-sm"
                style={{ background: PLAN_COLOUR[row.plan] }}
                aria-hidden="true"
              />
              <Link
                href={`/console/schools/${row.schoolId}`}
                className="min-w-0 flex-1 truncate text-body hover:text-sa-blue"
              >
                {row.school}
              </Link>
              <span className="tabular shrink-0 text-sa-muted">{formatCurrency(row.ltv)}</span>
              <span className="hidden w-44 shrink-0 truncate text-right text-caption text-sa-dim sm:block">
                {row.reason ?? "No reason recorded"}
              </span>
              <span className="tabular shrink-0 text-caption text-sa-dim">
                {row.churnedAt ? new Date(row.churnedAt).toLocaleDateString("en-GB") : "—"}
              </span>
            </div>
          ))}
        </Panel>
      </div>

      {/* AI forecast */}
      <div className="mt-5">
        <ForecastPanel />
      </div>
    </>
  )
}
