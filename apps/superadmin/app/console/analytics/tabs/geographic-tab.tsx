import Link from "next/link"

import { StateChoropleth } from "@/components/charts/state-choropleth"
import { geographicBreakdown } from "@/lib/analytics"
import { PLAN_LABEL } from "@/lib/plans"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"
import { Panel } from "../panel"
import { GeoView } from "../geo-view"

export async function GeographicTab({ view }: { view: "map" | "table" }) {
  const { rows, totals, opportunity } = await geographicBreakdown()
  const maxSchools = rows.reduce((max, row) => Math.max(max, row.schools), 0)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Panel title="States covered">
          <p className="font-mono text-display tabular-nums text-sa-text">
            {rows.filter((row) => row.schools > 0).length}
          </p>
          <p className="mt-1 text-caption text-sa-dim">of 36 states plus the FCT</p>
        </Panel>
        <Panel title="Schools">
          <p className="font-mono text-display tabular-nums text-sa-text">
            {formatNumber(totals.schools)}
          </p>
          <p className="mt-1 text-caption text-sa-dim">
            {formatNumber(totals.students)} students enrolled
          </p>
        </Panel>
        <Panel title="MRR">
          <p className="font-mono text-display tabular-nums text-sa-text">
            {formatCurrency(totals.mrr)}
          </p>
          <p className="mt-1 text-caption text-sa-dim">Monthly-equivalent, ACTIVE and PAST_DUE</p>
        </Panel>
      </div>

      <Panel
        title="Schools by state"
        subtitle="A tile grid, not a polygon map: at dashboard size most Nigerian states render as unreadable slivers, and no offline GeoJSON ships with this stack."
        action={<GeoView view={view} />}
        bodyClassName={view === "table" ? "p-0" : "p-4"}
      >
        {view === "map" ? (
          <StateChoropleth
            data={rows.map((row) => ({
              state: row.state,
              schools: row.schools,
              mrr: row.mrr,
              topPlan: row.topPlan,
            }))}
            maxSchools={maxSchools}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    State
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Schools
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Students
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    MRR
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Top plan
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    90-day growth
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.state} className="border-b border-sa-border/60 last:border-0">
                    <td className="px-4 py-1.5 text-sa-text">{row.state}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-sa-text">
                      {formatNumber(row.schools)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-sa-muted">
                      {formatNumber(row.students)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-sa-text">
                      {formatCurrency(row.mrr)}
                    </td>
                    <td className="px-3 py-1.5 text-sa-muted">
                      {row.topPlan ? PLAN_LABEL[row.topPlan] : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-right font-mono tabular-nums",
                        row.growthPercent === null
                          ? "text-sa-disabled"
                          : row.growthPercent > 0
                            ? "text-sa-green"
                            : row.growthPercent < 0
                              ? "text-sa-red"
                              : "text-sa-dim",
                      )}
                    >
                      {row.growthPercent === null
                        ? "new"
                        : `${row.growthPercent > 0 ? "+" : ""}${row.growthPercent.toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Expansion opportunities"
        subtitle="States with schools on the platform but low penetration relative to their neighbours"
      >
        {opportunity.length === 0 ? (
          <p className="text-body text-sa-dim">Nothing stands out at current coverage.</p>
        ) : (
          <ul className="space-y-2">
            {opportunity.map((row) => (
              <li
                key={row.state}
                className="flex items-center justify-between gap-3 border-b border-sa-border/60 pb-2 last:border-0 last:pb-0"
              >
                <div>
                  <p className="text-body text-sa-text">{row.state}</p>
                  <p className="text-caption text-sa-dim">
                    {formatNumber(row.schools)} school{row.schools === 1 ? "" : "s"} ·{" "}
                    {formatNumber(row.students)} student{row.students === 1 ? "" : "s"}
                  </p>
                </div>
                <Link
                  href={`/console/schools?state=${encodeURIComponent(row.state)}`}
                  className="text-caption text-sa-blue hover:underline"
                >
                  View schools
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
