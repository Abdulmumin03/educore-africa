import { cn } from "@/lib/utils"

type PoolStats = {
  active: number
  idle: number
  waiting: number
  total: number
  serverMax: number | null
  note: string
}

type RedisStats = {
  usedBytes: number
  maxBytes: number | null
  percent: number | null
  keys: number | null
  evictionPolicy: string | null
  note: string
}

function bytes(value: number): string {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${value} B`
}

/** A bar only where there is a real ceiling to draw against. */
function Bar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent))
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-sa-raised">
      <div
        className={cn(
          "h-2 rounded-full",
          clamped >= 90 ? "bg-sa-red" : clamped >= 70 ? "bg-sa-amber" : "bg-sa-green",
        )}
        style={{ width: `${Math.max(1, clamped)}%` }}
      />
    </div>
  )
}

export function PoolGauge({ pool }: { pool: PoolStats | null }) {
  if (!pool) {
    return <p className="text-body text-sa-dim">Could not read the connection state.</p>
  }

  const percent = pool.serverMax ? (pool.total / pool.serverMax) * 100 : null

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-display tabular-nums text-sa-text">{pool.total}</span>
        <span className="text-caption text-sa-dim">
          {pool.serverMax ? `of ${pool.serverMax} max` : "no server cap reported"}
        </span>
      </div>

      {percent === null ? (
        <p className="rounded-md border border-dashed border-sa-border px-2 py-1.5 text-caption text-sa-dim">
          No max_connections reported, so there is no ceiling to draw a bar against.
        </p>
      ) : (
        <Bar percent={percent} />
      )}

      <dl className="mt-3 grid grid-cols-3 gap-3">
        {[
          { label: "Active", value: pool.active, tone: "text-sa-green" },
          { label: "Idle", value: pool.idle, tone: "text-sa-muted" },
          { label: "Aborted", value: pool.waiting, tone: pool.waiting > 0 ? "text-sa-amber" : "text-sa-dim" },
        ].map((entry) => (
          <div key={entry.label}>
            <dt className="text-caption text-sa-dim">{entry.label}</dt>
            <dd className={cn("font-mono text-h2 tabular-nums", entry.tone)}>{entry.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-2 text-caption text-sa-dim">{pool.note}</p>
    </div>
  )
}

export function RedisGauge({ stats }: { stats: RedisStats | null }) {
  if (!stats) {
    return <p className="text-body text-sa-dim">Could not read Redis memory.</p>
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-display tabular-nums text-sa-text">
          {bytes(stats.usedBytes)}
        </span>
        <span className="text-caption text-sa-dim">
          {stats.maxBytes ? `of ${bytes(stats.maxBytes)}` : "unbounded"}
        </span>
      </div>

      {stats.percent === null ? (
        <p className="rounded-md border border-dashed border-sa-border px-2 py-1.5 text-caption text-sa-dim">
          {stats.note}
        </p>
      ) : (
        <>
          <Bar percent={stats.percent} />
          <p className="mt-1 text-caption text-sa-dim">
            {stats.percent.toFixed(1)}% used · {stats.note}
          </p>
        </>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-caption text-sa-dim">Keys</dt>
          <dd className="font-mono text-h2 tabular-nums text-sa-text">
            {stats.keys === null ? "—" : stats.keys.toLocaleString("en-NG")}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-sa-dim">Eviction</dt>
          <dd className="font-mono text-body text-sa-muted">{stats.evictionPolicy ?? "unknown"}</dd>
        </div>
      </dl>
    </div>
  )
}
