import Link from "next/link"

import { featureAdoptionMatrix } from "@/lib/analytics"
import { PLAN_LABEL, PLAN_ORDER } from "@/lib/plans"
import { cn, formatNumber } from "@/lib/utils"
import { Panel } from "../panel"

// Sequential single hue on a dark surface: near-background to bright blue, so
// "more adoption" reads as brighter. Same ramp as the state choropleth.
const RAMP = ["#14243A", "#1B3B5E", "#235489", "#2C6EB5", "#3B82F6", "#60A5FA"]

function level(percent: number): number {
  if (percent <= 0) return 0
  if (percent < 10) return 1
  if (percent < 30) return 2
  if (percent < 55) return 3
  if (percent < 80) return 4
  return 5
}

export async function AdoptionTab() {
  const { rows, planTotals, totalSchools, platformSchools, unplanned } =
    await featureAdoptionMatrix()

  const built = rows.filter((row) => row.built)
  const unbuilt = rows.filter((row) => !row.built)
  const strongest = [...built].sort((a, b) => b.overall.percent - a.overall.percent).slice(0, 3)
  const weakest = [...built].sort((a, b) => a.overall.percent - b.overall.percent).slice(0, 3)

  return (
    <div className="space-y-4">
      <Panel
        title="Feature adoption"
        subtitle={`${formatNumber(totalSchools)} of ${formatNumber(platformSchools)} schools have a plan and appear in the grid · a school counts as adopting a module once it has written at least one row to it`}
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                <th scope="col" className="sticky left-0 z-10 bg-sa-surface px-4 py-2 text-left font-medium">
                  Module
                </th>
                {PLAN_ORDER.map((plan) => (
                  <th key={plan} scope="col" className="px-3 py-2 text-center font-medium">
                    <div>{PLAN_LABEL[plan]}</div>
                    <div className="font-mono text-[10px] font-normal normal-case tabular-nums text-sa-disabled">
                      {formatNumber(planTotals[plan] ?? 0)} schools
                    </div>
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Overall
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.module} className="border-b border-sa-border/60 last:border-0">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-sa-surface px-4 py-2 text-left font-normal text-sa-text"
                  >
                    {row.label}
                    {!row.built && (
                      <span className="ml-2 rounded border border-sa-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sa-dim">
                        not built
                      </span>
                    )}
                  </th>

                  {row.built ? (
                    <>
                      {PLAN_ORDER.map((plan) => {
                        const cell = row.cells.find((entry) => entry.plan === plan)
                        const percent = cell?.percent ?? 0
                        const shade = level(percent)
                        return (
                          <td key={plan} className="px-1.5 py-1.5 text-center">
                            <div
                              title={`${row.label} · ${PLAN_LABEL[plan]}: ${cell?.using ?? 0} of ${cell?.schools ?? 0} schools`}
                              className={cn(
                                "mx-auto flex h-9 w-full min-w-[68px] items-center justify-center rounded font-mono text-caption tabular-nums",
                                shade >= 4 ? "text-sa-base" : "text-sa-text/85",
                                (cell?.schools ?? 0) === 0 && "text-sa-disabled",
                              )}
                              style={{ backgroundColor: RAMP[shade] }}
                            >
                              {(cell?.schools ?? 0) === 0 ? "—" : `${percent.toFixed(0)}%`}
                            </div>
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-sa-text">
                        {row.overall.percent.toFixed(0)}%
                        <span className="ml-1.5 text-caption text-sa-dim">
                          {formatNumber(row.overall.using)}/{formatNumber(row.overall.schools)}
                        </span>
                      </td>
                    </>
                  ) : (
                    <td
                      colSpan={PLAN_ORDER.length + 1}
                      className="px-3 py-2 text-caption text-sa-dim"
                    >
                      No table backs this module on the platform yet — reporting 0% would read as
                      &ldquo;nobody uses it&rdquo; rather than &ldquo;it does not exist&rdquo;.
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2 border-t border-sa-border px-4 py-2 text-caption text-sa-dim">
          <span>0%</span>
          {RAMP.map((colour) => (
            <span key={colour} className="h-3 w-6 rounded-sm" style={{ backgroundColor: colour }} />
          ))}
          <span>100%</span>
          <span className="ml-auto flex flex-wrap gap-x-3">
            {unplanned > 0 && (
              <span>
                {formatNumber(unplanned)} school{unplanned === 1 ? "" : "s"} excluded — no plan to
                place them under
              </span>
            )}
            {unbuilt.length > 0 && (
              <span>
                {unbuilt.length} module{unbuilt.length === 1 ? "" : "s"} not built:{" "}
                {unbuilt.map((row) => row.label).join(", ")}
              </span>
            )}
          </span>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Most adopted" subtitle="Across every plan">
          <ol className="space-y-2">
            {strongest.map((row) => (
              <li key={row.module} className="flex items-center justify-between gap-3">
                <span className="text-body text-sa-text">{row.label}</span>
                <span className="font-mono text-body tabular-nums text-sa-green">
                  {row.overall.percent.toFixed(0)}%
                </span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Weakest adoption" subtitle="Candidates for onboarding or in-app prompts">
          <ol className="space-y-2">
            {weakest.map((row) => (
              <li key={row.module} className="flex items-center justify-between gap-3">
                <span className="text-body text-sa-text">{row.label}</span>
                <span className="font-mono text-body tabular-nums text-sa-amber">
                  {row.overall.percent.toFixed(0)}%
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-caption text-sa-dim">
            Low adoption on a paid tier is a churn signal —{" "}
            <Link href="/console/support/health" className="text-sa-blue hover:underline">
              cross-check the health monitor
            </Link>
            .
          </p>
        </Panel>
      </div>
    </div>
  )
}
