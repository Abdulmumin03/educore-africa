import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"

// Service health.
//
// Every status on this page comes from an actual probe. A service the console
// has no way to reach — no key configured, no endpoint — is reported as
// `unknown`, never as green. "We did not check" and "it is up" look identical
// on a status board and mean opposite things, which is exactly the failure a
// status board exists to prevent.

export type ServiceState = "up" | "degraded" | "down" | "unknown"

export type ServiceKey =
  | "web_app"
  | "console_api"
  | "postgres"
  | "redis"
  | "s3"
  | "paystack"
  | "flutterwave"
  | "africastalking"
  | "anthropic"

export type ServiceProbe = {
  key: ServiceKey
  label: string
  state: ServiceState
  /** Round-trip in milliseconds; null when the probe did not run. */
  responseMs: number | null
  detail: string
  at: string
}

const HISTORY_KEY = "svc:history:"
const SNAPSHOT_KEY = "svc:snapshot"
const LAST_RUN_KEY = "svc:lastrun"
/** One sample a minute for 31 days is enough to compute a monthly uptime. */
const HISTORY_MAX = 45_000
const HISTORY_TTL = 32 * 24 * 60 * 60
/** Probes run at most this often, however many tabs are watching. */
export const PROBE_INTERVAL_MS = 60_000
/** A probe that has not answered by now is treated as down. */
const PROBE_TIMEOUT_MS = 4_000

const SERVICE_LABELS: Record<ServiceKey, string> = {
  web_app: "Web App",
  console_api: "API Server",
  postgres: "PostgreSQL",
  redis: "Redis",
  s3: "S3",
  paystack: "Paystack",
  flutterwave: "Flutterwave",
  africastalking: "Africa's Talking",
  anthropic: "Anthropic API",
}

/** Anything slower than this is up, but not healthy. */
const DEGRADED_MS: Record<ServiceKey, number> = {
  web_app: 1500,
  console_api: 500,
  postgres: 300,
  redis: 150,
  s3: 1500,
  paystack: 2000,
  flutterwave: 2000,
  africastalking: 2000,
  anthropic: 3000,
}

function grade(key: ServiceKey, ms: number): ServiceState {
  return ms > DEGRADED_MS[key] ? "degraded" : "up"
}

async function timed(
  key: ServiceKey,
  run: () => Promise<string>,
): Promise<ServiceProbe> {
  const startedAt = Date.now()
  try {
    const detail = await run()
    const responseMs = Date.now() - startedAt
    return {
      key,
      label: SERVICE_LABELS[key],
      state: grade(key, responseMs),
      responseMs,
      detail,
      at: new Date().toISOString(),
    }
  } catch (error) {
    return {
      key,
      label: SERVICE_LABELS[key],
      state: "down",
      responseMs: Date.now() - startedAt,
      detail: error instanceof Error ? error.message.slice(0, 160) : "Probe failed",
      at: new Date().toISOString(),
    }
  }
}

function unknown(key: ServiceKey, detail: string): ServiceProbe {
  return {
    key,
    label: SERVICE_LABELS[key],
    state: "unknown",
    responseMs: null,
    detail,
    at: new Date().toISOString(),
  }
}

/** fetch with a hard deadline — a hung third party must not hold the probe. */
async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" })
  } finally {
    clearTimeout(timer)
  }
}

async function probeAll(): Promise<ServiceProbe[]> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

  return Promise.all([
    // The school app exposes its own liveness endpoint.
    timed("web_app", async () => {
      const response = await fetchWithTimeout(`${appUrl}/api/health`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return "Liveness endpoint responded"
    }),

    // The console's API runs in this very process, so a self-request would
    // measure the loopback more than the app. Timing a trivial DB round trip
    // through the same Prisma client the routes use is the honest proxy, and
    // the label says so.
    timed("console_api", async () => {
      await prisma.$queryRaw`SELECT 1`
      return "In-process; timed via its own database client"
    }),

    timed("postgres", async () => {
      const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*)::bigint AS n FROM pg_stat_activity WHERE datname = current_database()
      `
      return `${Number(rows[0]?.n ?? 0)} connections on this database`
    }),

    timed("redis", async () => {
      const pong = await redis.ping()
      return `PING → ${pong}`
    }),

    // No AWS SDK in this app. A public HEAD on the bucket proves the endpoint
    // resolves and the bucket exists; it does NOT prove our credentials work,
    // and the detail line says exactly that rather than implying more.
    process.env.S3_BUCKET
      ? timed("s3", async () => {
          const region = process.env.AWS_REGION ?? "us-east-1"
          const response = await fetchWithTimeout(
            `https://${process.env.S3_BUCKET}.s3.${region}.amazonaws.com/`,
            { method: "HEAD" },
          )
          // 403 is the healthy answer for a private bucket: it resolved and
          // refused an anonymous listing.
          if (response.status >= 500) throw new Error(`HTTP ${response.status}`)
          return "Bucket endpoint reachable (credentials not verified)"
        })
      : Promise.resolve(unknown("s3", "S3_BUCKET is not set — nothing to probe")),

    process.env.PAYSTACK_SECRET_KEY
      ? timed("paystack", async () => {
          const response = await fetchWithTimeout("https://api.paystack.co/bank?perPage=1", {
            headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
          })
          if (response.status === 401) throw new Error("Key rejected (401)")
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return "Authenticated call succeeded"
        })
      : Promise.resolve(
          unknown("paystack", "PAYSTACK_SECRET_KEY is not set — nothing to probe"),
        ),

    process.env.FLUTTERWAVE_SECRET_KEY
      ? timed("flutterwave", async () => {
          const response = await fetchWithTimeout("https://api.flutterwave.com/v3/banks/NG", {
            headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
          })
          if (response.status === 401) throw new Error("Key rejected (401)")
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return "Authenticated call succeeded"
        })
      : Promise.resolve(
          unknown("flutterwave", "FLUTTERWAVE_SECRET_KEY is not set — nothing to probe"),
        ),

    process.env.AFRICASTALKING_API_KEY && process.env.AFRICASTALKING_USERNAME
      ? timed("africastalking", async () => {
          const response = await fetchWithTimeout(
            `https://api.africastalking.com/version1/user?username=${process.env.AFRICASTALKING_USERNAME}`,
            {
              headers: {
                apiKey: process.env.AFRICASTALKING_API_KEY as string,
                Accept: "application/json",
              },
            },
          )
          if (response.status === 401) throw new Error("Key rejected (401)")
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const body = (await response.json()) as { UserData?: { balance?: string } }
          return body.UserData?.balance
            ? `Balance ${body.UserData.balance}`
            : "Authenticated call succeeded"
        })
      : Promise.resolve(
          unknown("africastalking", "Africa's Talking credentials are not set — nothing to probe"),
        ),

    process.env.ANTHROPIC_API_KEY
      ? timed("anthropic", async () => {
          // The models list is the cheapest authenticated call; it bills nothing.
          const response = await fetchWithTimeout("https://api.anthropic.com/v1/models?limit=1", {
            headers: {
              "x-api-key": process.env.ANTHROPIC_API_KEY as string,
              "anthropic-version": "2023-06-01",
            },
          })
          if (response.status === 401) throw new Error("Key rejected (401)")
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return "Authenticated call succeeded"
        })
      : Promise.resolve(unknown("anthropic", "ANTHROPIC_API_KEY is not set — nothing to probe")),
  ])
}

export type ServiceStatus = ServiceProbe & {
  /** Share of recorded samples this month that were up or degraded. */
  uptimePercent: number | null
  samples: number
}

/**
 * The current board, probing at most once a minute.
 *
 * A dozen open tabs polling every 30 seconds must not mean a dozen calls a
 * minute to Paystack, so the probe result is cached and every reader after
 * the first gets the cached snapshot until it ages out.
 */
export async function serviceStatus(force = false): Promise<{
  services: ServiceStatus[]
  probedAt: string
  stale: boolean
}> {
  let snapshot: ServiceProbe[] | null = null
  let lastRun = 0

  try {
    const [cached, ran] = await Promise.all([redis.get(SNAPSHOT_KEY), redis.get(LAST_RUN_KEY)])
    if (cached) snapshot = JSON.parse(cached) as ServiceProbe[]
    lastRun = Number(ran ?? 0)
  } catch {
    // Redis down — probe live and skip the cache. The Redis card will say so.
  }

  const due = force || Date.now() - lastRun > PROBE_INTERVAL_MS
  if (due || !snapshot) {
    snapshot = await probeAll()
    try {
      const pipeline = redis.multi()
      pipeline.set(SNAPSHOT_KEY, JSON.stringify(snapshot), "EX", 300)
      pipeline.set(LAST_RUN_KEY, String(Date.now()), "EX", 300)
      for (const probe of snapshot) {
        // "unknown" is not recorded: it would otherwise drag a service's
        // uptime down for the crime of not being configured.
        if (probe.state === "unknown") continue
        const key = `${HISTORY_KEY}${probe.key}`
        pipeline.lpush(key, probe.state === "down" ? "0" : "1")
        pipeline.ltrim(key, 0, HISTORY_MAX - 1)
        pipeline.expire(key, HISTORY_TTL)
      }
      await pipeline.exec()
    } catch {
      // Recording is best-effort; the board still renders.
    }
  }

  const services: ServiceStatus[] = await Promise.all(
    snapshot.map(async (probe) => {
      let samples: string[] = []
      try {
        samples = await redis.lrange(`${HISTORY_KEY}${probe.key}`, 0, HISTORY_MAX - 1)
      } catch {
        // No history available.
      }
      const up = samples.filter((entry) => entry === "1").length
      return {
        ...probe,
        samples: samples.length,
        uptimePercent: samples.length > 0 ? (up / samples.length) * 100 : null,
      }
    }),
  )

  const probedAt = snapshot[0]?.at ?? new Date().toISOString()
  return {
    services,
    probedAt,
    stale: !due && Date.now() - lastRun > PROBE_INTERVAL_MS * 2,
  }
}
