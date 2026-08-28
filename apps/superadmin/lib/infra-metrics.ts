import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"

// Infrastructure gauges for the System page.
//
// Both readings come from the systems themselves — `pg_stat_activity` and
// Redis `INFO` — rather than from anything the console keeps. Where a figure
// genuinely is not available (an unbounded Redis with no maxmemory, a pooler
// that hides its own state) it is returned null and the gauge says so instead
// of drawing a full bar.

export type PoolStats = {
  active: number
  idle: number
  waiting: number
  total: number
  /** Postgres `max_connections`, which is the server cap, not Prisma's pool. */
  serverMax: number | null
  note: string
}

export async function connectionPool(): Promise<PoolStats | null> {
  try {
    const [rows, settings] = await Promise.all([
      prisma.$queryRaw<Array<{ state: string | null; n: bigint }>>`
        SELECT state, count(*)::bigint AS n
        FROM pg_stat_activity
        WHERE datname = current_database()
        GROUP BY state
      `,
      prisma.$queryRaw<Array<{ setting: string }>>`
        SELECT setting FROM pg_settings WHERE name = 'max_connections'
      `,
    ])

    const byState = new Map(rows.map((row) => [row.state ?? "unknown", Number(row.n)]))
    const active = byState.get("active") ?? 0
    const idle = (byState.get("idle") ?? 0) + (byState.get("idle in transaction") ?? 0)
    const waiting = byState.get("idle in transaction (aborted)") ?? 0
    const total = [...byState.values()].reduce((sum, n) => sum + n, 0)

    return {
      active,
      idle,
      waiting,
      total,
      serverMax: settings[0] ? Number(settings[0].setting) : null,
      note: "Server-side connection states. Behind a pooler these are the pooler's connections, not one per request.",
    }
  } catch {
    return null
  }
}

export type RedisStats = {
  usedBytes: number
  maxBytes: number | null
  percent: number | null
  keys: number | null
  evictionPolicy: string | null
  note: string
}

function parseInfo(info: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of info.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue
    const index = line.indexOf(":")
    if (index === -1) continue
    out[line.slice(0, index)] = line.slice(index + 1).trim()
  }
  return out
}

export async function redisMemory(): Promise<RedisStats | null> {
  try {
    const [memoryInfo, keyspaceInfo, policy] = await Promise.all([
      redis.info("memory"),
      redis.info("keyspace"),
      redis.config("GET", "maxmemory-policy").catch(() => null),
    ])

    const memory = parseInfo(memoryInfo)
    const usedBytes = Number(memory.used_memory ?? 0)
    const configuredMax = Number(memory.maxmemory ?? 0)
    const maxBytes = configuredMax > 0 ? configuredMax : null

    // db0:keys=123,expires=4,avg_ttl=0
    const dbLine = Object.entries(parseInfo(keyspaceInfo)).find(([key]) => key.startsWith("db"))
    const keys = dbLine ? Number(/keys=(\d+)/.exec(dbLine[1])?.[1] ?? 0) : 0

    const evictionPolicy = Array.isArray(policy) ? String(policy[1] ?? "") || null : null

    return {
      usedBytes,
      maxBytes,
      percent: maxBytes ? (usedBytes / maxBytes) * 100 : null,
      keys,
      evictionPolicy,
      note: maxBytes
        ? "Against the configured maxmemory."
        : "No maxmemory is configured, so there is no ceiling to show a percentage against.",
    }
  } catch {
    return null
  }
}
