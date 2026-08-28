import { cohortRetention } from "@/lib/revenue"
import { cn, formatNumber } from "@/lib/utils"
import { Panel } from "../panel"
import { RetentionInsights } from "../retention-insights"

// Retention is a magnitude, so one hue light-to-dark. Month 0 is 100% for
// every cohort by definition, so the top of the ramp is never informative on
// its own — the interesting reading is how fast a row falls off it.
const RAMP = ["#3B1518", "#5B2126", "#7A3A28", "#8A5A22", "#4E6B2A", "#2F6B3A"]

function shade(percent: number): string {
  if (percent >= 95) return RAMP[5]
  if (percent >= 85) return RAMP[4]
  if (percent >= 70) return RAMP[3]
  if (percent >= 50) return RAMP[2]
  if (percent >= 25) return RAMP[1]
  return RAMP[0]
}

export async function CohortsTab() {
  const { cohorts, periods } = await cohortRetention(12)
  const months = Array.from({ length: periods }, (_, index) => index)

  // Only cohorts old enough to have a month-3 figure belong in the average —
  // including a two-week-old cohort would flatter it to nearly 100%.
  const mature = cohorts.filter((cohort) => cohort.retention[3] !== null && cohort.retention[3] !== undefined)
  const averageM3 =
    mature.length > 0
      ? mature.reduce((sum, cohort) => sum + (cohort.retention[3] as number), 0) / mature.length
      : null

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Panel title="Cohorts tracked">
          <p className="font-mono text-display tabular-nums text-sa-text">{cohorts.length}</p>
          <p className="mt-1 text-caption text-sa-dim">Monthly signup cohorts, last 12 months</p>
        </Panel>
        <Panel title="Schools in cohorts">
          <p className="font-mono text-display tabular-nums text-sa-text">
            {formatNumber(cohorts.reduce((sum, cohort) => sum + cohort.size, 0))}
          </p>
          <p className="mt-1 text-caption text-sa-dim">Signed up in the window</p>
        </Panel>
        <Panel title="Average month-3 retention">
          <p className="font-mono text-display tabular-nums text-sa-text">
            {averageM3 === null ? "—" : `${averageM3.toFixed(1)}%`}
          </p>
          <p className="mt-1 text-caption text-sa-dim">
            {mature.length === 0
              ? "No cohort is three months old yet"
              : `Across ${mature.length} mature cohort${mature.length === 1 ? "" : "s"}`}
          </p>
        </Panel>
      </div>

      <Panel
        title="Retention by signup month"
        subtitle="A school is retained in month N if its subscription had not been cancelled by the end of that month. Month 0 is 100% by definition."
        bodyClassName="p-0"
      >
        {cohorts.length === 0 ? (
          <p className="px-4 py-6 text-body text-sa-dim">No signups in the last twelve months.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="sticky left-0 z-10 bg-sa-surface px-4 py-2 text-left font-medium">
                    Cohort
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Size
                  </th>
                  {months.map((month) => (
                    <th key={month} scope="col" className="px-2 py-2 text-center font-medium">
                      M{month}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((cohort) => (
                  <tr key={cohort.cohort} className="border-b border-sa-border/60 last:border-0">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-sa-surface px-4 py-1.5 text-left font-normal text-sa-text"
                    >
                      {cohort.label}
                    </th>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-sa-muted">
                      {formatNumber(cohort.size)}
                    </td>
                    {months.map((month) => {
                      const value = cohort.retention[month]
                      if (value === null || value === undefined) {
                        return (
                          <td key={month} className="px-1 py-1">
                            <div className="h-8 min-w-[46px] rounded border border-dashed border-sa-border/60" />
                          </td>
                        )
                      }
                      return (
                        <td key={month} className="px-1 py-1">
                          <div
                            title={`${cohort.label} · month ${month}: ${value.toFixed(1)}%`}
                            className="flex h-8 min-w-[46px] items-center justify-center rounded font-mono text-caption tabular-nums text-sa-text"
                            style={{ backgroundColor: shade(value) }}
                          >
                            {value.toFixed(0)}%
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-sa-border px-4 py-2 text-caption text-sa-dim">
          <span>0%</span>
          {RAMP.map((colour) => (
            <span key={colour} className="h-3 w-6 rounded-sm" style={{ backgroundColor: colour }} />
          ))}
          <span>100%</span>
          <span className="ml-3 inline-flex items-center gap-1.5">
            <span className="h-3 w-6 rounded-sm border border-dashed border-sa-border/60" />
            not yet reached
          </span>
        </div>
      </Panel>

      <Panel title="What the grid says" subtitle="Generated on demand — no model call happens on page load">
        <RetentionInsights />
      </Panel>
    </div>
  )
}
