import { growthFunnel } from "@/lib/analytics"
import { cn, formatNumber } from "@/lib/utils"
import { Panel, Unmeasured } from "../panel"

export async function FunnelTab() {
  const { stages } = await growthFunnel()

  const measurable = stages.filter((stage) => stage.measurable)
  const top = measurable[0]?.count ?? 0
  const worst = measurable
    .slice(1)
    .reduce<(typeof measurable)[number] | null>(
      (acc, stage) => (acc === null || stage.dropOff > acc.dropOff ? stage : acc),
      null,
    )

  return (
    <div className="space-y-4">
      <Panel
        title="Signup to renewal"
        subtitle="Every stage is a strict subset of the one above it, over the platform's whole history — a school reaches a stage only if it cleared every stage before it."
      >
        <ol className="space-y-3">
          {stages.map((stage, index) => {
            const width = top > 0 && stage.measurable ? Math.max(4, (stage.count / top) * 100) : 0

            return (
              <li key={stage.key}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <div>
                    <span className="text-body font-medium text-sa-text">
                      {index + 1}. {stage.label}
                    </span>
                    <span className="ml-2 text-caption text-sa-dim">{stage.description}</span>
                  </div>

                  {stage.measurable ? (
                    <div className="flex shrink-0 items-baseline gap-3 font-mono text-body tabular-nums">
                      <span className="text-sa-text">{formatNumber(stage.count)}</span>
                      <span className="w-14 text-right text-sa-dim">{stage.ofTop.toFixed(0)}%</span>
                      {stage.ofPrevious !== null && (
                        <span
                          title={`${stage.lost} school${stage.lost === 1 ? "" : "s"} lost at this step`}
                          className={cn(
                            "w-32 text-right text-caption",
                            stage.dropOff >= 40
                              ? "text-sa-red"
                              : stage.dropOff >= 20
                                ? "text-sa-amber"
                                : "text-sa-green",
                          )}
                        >
                          −{stage.lost} ({stage.dropOff.toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="shrink-0 text-caption uppercase tracking-wide text-sa-disabled">
                      not measured
                    </span>
                  )}
                </div>

                {stage.measurable ? (
                  <div className="h-7 w-full rounded bg-sa-raised">
                    <div
                      className="h-7 rounded bg-sa-blue/80"
                      style={{ width: `${width}%` }}
                      aria-hidden="true"
                    />
                  </div>
                ) : (
                  <div
                    className="h-7 w-full rounded border border-dashed border-sa-border"
                    aria-hidden="true"
                  />
                )}
              </li>
            )
          })}
        </ol>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Biggest drop-off">
          {worst ? (
            <>
              <p className="text-h2 text-sa-text">{worst.label}</p>
              <p className="mt-1 font-mono text-display tabular-nums text-sa-red">
                −{worst.dropOff.toFixed(0)}%
              </p>
              <p className="mt-2 text-caption text-sa-dim">
                {formatNumber(worst.lost)} school{worst.lost === 1 ? "" : "s"} drop out here;{" "}
                {formatNumber(worst.count)} carry on.
              </p>
            </>
          ) : (
            <p className="text-body text-sa-dim">Not enough stages to compare.</p>
          )}
        </Panel>

        <Panel title="What is not counted">
          <Unmeasured>
            Stage 1 (&ldquo;visited the signup page&rdquo;) has no source: the platform has no web
            analytics table, and back-filling visits from registrations would only restate stage 2
            with a made-up multiplier. It stays blank until a real pageview source exists.
          </Unmeasured>
        </Panel>
      </div>
    </div>
  )
}
