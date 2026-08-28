import type { Metadata } from "next"

import { PageHeader } from "@/components/shared/page-header"
import { cohortRetention } from "@/lib/revenue"
import { requireRole } from "@/lib/session"
import { cn, formatNumber } from "@/lib/utils"
import { RevenueNav } from "../revenue-nav"

export const metadata: Metadata = { title: "Cohorts" }
export const dynamic = "force-dynamic"

/**
 * Single-hue sequential ramp. On a dark surface the scale runs from
 * near-background to bright blue, so "better retention" reads as brighter —
 * the same direction as every other heatmap in the console.
 */
function cellStyle(value: number | null): { className: string; text: string } {
  if (value === null) return { className: "bg-sa-base/40 text-transparent", text: "" }
  if (value >= 95) return { className: "bg-[#60A5FA] text-sa-base", text: `${Math.round(value)}` }
  if (value >= 85) return { className: "bg-[#3B82F6] text-sa-base", text: `${Math.round(value)}` }
  if (value >= 70) return { className: "bg-[#2F79C9] text-sa-text", text: `${Math.round(value)}` }
  if (value >= 50) return { className: "bg-[#26619F] text-sa-text", text: `${Math.round(value)}` }
  if (value > 0) return { className: "bg-[#1D4A7C] text-sa-muted", text: `${Math.round(value)}` }
  return { className: "bg-[#16304C] text-sa-dim", text: "0" }
}

export default async function CohortsPage({ searchParams }: { searchParams: { months?: string } }) {
  await requireRole("BUSINESS_ADMIN", "FINANCE_ADMIN", "ANALYTICS_ADMIN")

  const months = Math.min(24, Math.max(3, Number(searchParams.months ?? 12) || 12))
  const { cohorts, periods } = await cohortRetention(months)

  const withMembers = cohorts.filter((cohort) => cohort.size > 0)
  const totalSchools = cohorts.reduce((sum, cohort) => sum + cohort.size, 0)

  // Average retention per period across every cohort that has reached it.
  const averages = Array.from({ length: periods + 1 }, (_, period) => {
    const values = withMembers
      .map((cohort) => cohort.retention[period])
      .filter((value): value is number => value !== null)
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null
  })

  return (
    <>
      <PageHeader
        title="Cohort retention"
        description={`${formatNumber(totalSchools)} schools across ${withMembers.length} monthly cohorts`}
      />
      <RevenueNav />

      <section className="overflow-hidden rounded-lg border border-sa-border bg-sa-surface">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-sa-border px-4 py-2.5">
          <div>
            <h2 className="text-h3">Percent still subscribed</h2>
            <p className="text-caption text-sa-dim">
              Rows are signup month; columns are months since. Blank cells have not happened yet.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-caption text-sa-dim">0%</span>
            <span className="flex gap-0.5">
              {["#16304C", "#1D4A7C", "#26619F", "#2F79C9", "#3B82F6", "#60A5FA"].map((colour) => (
                <span key={colour} className="h-2.5 w-6" style={{ background: colour }} />
              ))}
            </span>
            <span className="text-caption text-sa-dim">100%</span>
          </div>
        </header>

        <div className="overflow-x-auto p-4">
          <table className="border-separate border-spacing-1 text-caption">
            <thead>
              <tr>
                <th scope="col" className="px-2 text-left text-[11px] font-semibold uppercase tracking-wider text-sa-dim">
                  Cohort
                </th>
                <th scope="col" className="px-2 text-right text-[11px] font-semibold uppercase tracking-wider text-sa-dim">
                  n
                </th>
                {Array.from({ length: periods + 1 }, (_, period) => (
                  <th
                    key={period}
                    scope="col"
                    className="w-10 text-center text-[11px] font-semibold uppercase tracking-wider text-sa-dim"
                  >
                    M{period}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort) => (
                <tr key={cohort.cohort}>
                  <th scope="row" className="whitespace-nowrap px-2 text-left font-normal text-sa-text">
                    {cohort.label}
                  </th>
                  <td className="tabular px-2 text-right text-sa-dim">{cohort.size || "—"}</td>
                  {cohort.retention.map((value, period) => {
                    const style = cellStyle(cohort.size > 0 ? value : null)
                    return (
                      <td key={period} className="p-0">
                        <div
                          title={
                            value === null
                              ? undefined
                              : `${cohort.label} · month ${period} · ${value.toFixed(1)}% of ${cohort.size}`
                          }
                          className={cn(
                            "tabular flex h-7 w-10 items-center justify-center rounded text-[11px] font-semibold",
                            style.className,
                          )}
                        >
                          {style.text}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}

              <tr>
                <th scope="row" className="px-2 pt-2 text-left text-[11px] font-semibold uppercase tracking-wider text-sa-dim">
                  Average
                </th>
                <td />
                {averages.map((value, period) => (
                  <td key={period} className="pt-2">
                    <div className="tabular flex h-7 w-10 items-center justify-center rounded border border-sa-border-em text-[11px] font-semibold text-sa-muted">
                      {value === null ? "" : Math.round(value)}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <p className="border-t border-sa-border px-4 py-2.5 text-caption text-sa-dim">
          A school counts as retained in month N if its subscription had not been cancelled by the end
          of that month. Month 0 is always 100% by definition.
        </p>
      </section>
    </>
  )
}
