import { endpointStats } from "@/lib/api-metrics"
import { cn, formatNumber } from "@/lib/utils"
import { Panel, Unmeasured } from "../panel"

function tone(ms: number): string {
  if (ms >= 1000) return "text-sa-red"
  if (ms >= 400) return "text-sa-amber"
  return "text-sa-green"
}

export async function PerformanceTab() {
  const { endpoints, hourly, sampled, windowHours } = await endpointStats()

  const totalCalls = endpoints.reduce((sum, row) => sum + row.calls, 0)
  const allP95 = endpoints.flatMap((row) => Array<number>(row.calls).fill(row.p95))
  const worstP95 = endpoints[0] ?? null
  const errorTotal = endpoints.reduce((sum, row) => sum + row.errors4xx + row.errors5xx, 0)
  const maxHourly = hourly.reduce((max, bucket) => Math.max(max, bucket.calls), 0)

  return (
    <div className="space-y-4">
      <Unmeasured>
        These figures are the console&rsquo;s own traffic, timed at the session guard that every
        protected route shares — a floor on latency, not the whole handler. There is no APM in this
        stack, so nothing here is modelled or estimated: an endpoint appears only once it has
        actually been called{sampled ? ` in the last ${windowHours} hours` : ""}.
      </Unmeasured>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel title="Sampled calls">
          <p className="font-mono text-display tabular-nums text-sa-text">{formatNumber(totalCalls)}</p>
          <p className="mt-1 text-caption text-sa-dim">
            Across {endpoints.length} endpoint{endpoints.length === 1 ? "" : "s"}
          </p>
        </Panel>
        <Panel title="Slowest P95">
          {worstP95 ? (
            <>
              <p className={cn("font-mono text-display tabular-nums", tone(worstP95.p95))}>
                {worstP95.p95}ms
              </p>
              <p className="mt-1 truncate font-mono text-caption text-sa-dim" title={worstP95.endpoint}>
                {worstP95.endpoint}
              </p>
            </>
          ) : (
            <p className="font-mono text-display tabular-nums text-sa-disabled">—</p>
          )}
        </Panel>
        <Panel title="Errors">
          <p
            className={cn(
              "font-mono text-display tabular-nums",
              errorTotal > 0 ? "text-sa-amber" : "text-sa-green",
            )}
          >
            {formatNumber(errorTotal)}
          </p>
          <p className="mt-1 text-caption text-sa-dim">
            {totalCalls > 0 ? `${((errorTotal / totalCalls) * 100).toFixed(1)}% of sampled calls` : "No calls sampled"}
          </p>
        </Panel>
        <Panel title="Median P95">
          <p className="font-mono text-display tabular-nums text-sa-text">
            {allP95.length > 0
              ? `${allP95.sort((a, b) => a - b)[Math.floor(allP95.length / 2)]}ms`
              : "—"}
          </p>
          <p className="mt-1 text-caption text-sa-dim">Call-weighted across endpoints</p>
        </Panel>
      </div>

      <Panel title="Requests per hour" subtitle="Last 24 hours, UTC">
        {maxHourly === 0 ? (
          <p className="text-body text-sa-dim">No traffic recorded in the window.</p>
        ) : (
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {hourly.map((bucket) => (
              <div key={bucket.hour} className="flex flex-1 flex-col items-center gap-1">
                <div
                  title={`${bucket.label}: ${bucket.calls} calls`}
                  className="w-full rounded-t bg-sa-blue/70"
                  style={{ height: `${Math.max(1, (bucket.calls / maxHourly) * 96)}px` }}
                />
                <span className="font-mono text-[9px] tabular-nums text-sa-dim">{bucket.label}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="By endpoint" subtitle="Sorted by P95, slowest first" bodyClassName="p-0">
        {endpoints.length === 0 ? (
          <p className="px-4 py-6 text-body text-sa-dim">
            No samples yet. Use the console for a minute and this table fills in.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Endpoint
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Calls
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    P50
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    P95
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    P99
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Max
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    4xx / 5xx
                  </th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((row) => (
                  <tr key={row.endpoint} className="border-b border-sa-border/60 last:border-0">
                    <td className="px-4 py-1.5 font-mono text-caption text-sa-text">{row.endpoint}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-sa-muted">
                      {formatNumber(row.calls)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-sa-muted">
                      {row.p50}ms
                    </td>
                    <td className={cn("px-3 py-1.5 text-right font-mono tabular-nums", tone(row.p95))}>
                      {row.p95}ms
                    </td>
                    <td className={cn("px-3 py-1.5 text-right font-mono tabular-nums", tone(row.p99))}>
                      {row.p99}ms
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-sa-dim">
                      {row.max}ms
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                      <span className={row.errors4xx > 0 ? "text-sa-amber" : "text-sa-dim"}>
                        {row.errors4xx}
                      </span>
                      <span className="text-sa-disabled"> / </span>
                      <span className={row.errors5xx > 0 ? "text-sa-red" : "text-sa-dim"}>
                        {row.errors5xx}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
