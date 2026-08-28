import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/shared/page-header"
import { Panel } from "@/components/shared/panel"
import { errorLog } from "@/lib/api-errors"
import { hourlyLatency } from "@/lib/api-metrics"
import { connectionPool, redisMemory } from "@/lib/infra-metrics"
import { queueSnapshots } from "@/lib/queues"
import { serviceStatus } from "@/lib/services"
import { requireRole } from "@/lib/session"
import { ErrorMonitor } from "./error-monitor"
import { LatencyChart } from "./latency-chart"
import { PoolGauge, RedisGauge } from "./gauges"
import { QueueMonitor } from "./queue-monitor"
import { ServiceBoard } from "./service-board"
import { SystemNav } from "./system-nav"

export const metadata: Metadata = { title: "System Health" }
export const dynamic = "force-dynamic"

export default async function SystemPage() {
  await requireRole("ENGINEERING_ADMIN", "BUSINESS_ADMIN")

  const [services, errors, queues, latency, pool, redis] = await Promise.all([
    serviceStatus(),
    errorLog({ since: new Date(Date.now() - 24 * 3_600_000), minStatus: 400 }),
    queueSnapshots(),
    hourlyLatency(),
    connectionPool(),
    redisMemory(),
  ])

  const down = services.services.filter((service) => service.state === "down").length
  const degraded = services.services.filter((service) => service.state === "degraded").length

  return (
    <>
      <PageHeader
        title="System health"
        description={
          down > 0
            ? `${down} service${down === 1 ? "" : "s"} down`
            : degraded > 0
              ? `${degraded} service${degraded === 1 ? "" : "s"} responding slowly`
              : "All probed services are responding."
        }
      />

      <SystemNav />

      <div className="space-y-4">
        <ServiceBoard initial={services} />

        <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-sa-surface" />}>
          <ErrorMonitor initial={errors} />
        </Suspense>

        <QueueMonitor initial={queues} />

        <Panel
          title="API response time"
          subtitle="P50, P95 and P99 by hour over the last 24 hours, sampled at the session guard every protected route shares"
        >
          <LatencyChart buckets={latency.buckets} />
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Database connections" subtitle="From pg_stat_activity">
            <PoolGauge pool={pool} />
          </Panel>
          <Panel title="Redis memory" subtitle="From INFO memory">
            <RedisGauge stats={redis} />
          </Panel>
        </div>
      </div>
    </>
  )
}
