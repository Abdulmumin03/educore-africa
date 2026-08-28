import { redis } from "@/lib/redis"

// Real request telemetry for the API Performance tab.
//
// There is no APM in this stack, so rather than invent latency numbers the
// console measures its OWN traffic: every guarded route records its duration
// into a capped Redis list. The figures are therefore genuinely observed —
// they just only cover endpoints that have actually been called since the
// last Redis restart, which the UI says.

const KEY_PREFIX = "apiperf:"
const INDEX_KEY = "apiperf:endpoints"
const HOURLY_KEY = "apiperf:hourly"
const MAX_SAMPLES = 500
const TTL_SECONDS = 48 * 60 * 60

export type Sample = { ms: number; status: number; at: number }

/** Collapse ids out of a path so /schools/abc123/usage groups with its peers. */
export function normalisePath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) =>
      /^[a-z0-9]{20,}$/i.test(segment) ? ":id" : /^\d+$/.test(segment) ? ":n" : segment,
    )
    .join("/")
}

/** Fire-and-forget: telemetry must never slow down or break a request. */
export async function recordSample(pathname: string, ms: number, status: number): Promise<void> {
  const endpoint = normalisePath(pathname)
  const sample: Sample = { ms: Math.round(ms), status, at: Date.now() }

  try {
    const key = `${KEY_PREFIX}${endpoint}`
    await redis
      .multi()
      .lpush(key, JSON.stringify(sample))
      .ltrim(key, 0, MAX_SAMPLES - 1)
      .expire(key, TTL_SECONDS)
      .sadd(INDEX_KEY, endpoint)
      .expire(INDEX_KEY, TTL_SECONDS)
      .hincrby(HOURLY_KEY, new Date().toISOString().slice(0, 13), 1)
      .expire(HOURLY_KEY, TTL_SECONDS)
      .exec()
  } catch {
    // Redis down — drop the sample rather than fail the request.
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, index)]
}

export type EndpointStats = {
  endpoint: string
  calls: number
  p50: number
  p95: number
  p99: number
  max: number
  errors4xx: number
  errors5xx: number
  errorRate: number
}

export async function endpointStats(): Promise<{
  endpoints: EndpointStats[]
  hourly: Array<{ hour: string; label: string; calls: number }>
  sampled: boolean
  windowHours: number
}> {
  let names: string[] = []
  try {
    names = await redis.smembers(INDEX_KEY)
  } catch {
    return { endpoints: [], hourly: [], sampled: false, windowHours: 48 }
  }

  const endpoints: EndpointStats[] = []
  for (const endpoint of names) {
    let raw: string[] = []
    try {
      raw = await redis.lrange(`${KEY_PREFIX}${endpoint}`, 0, MAX_SAMPLES - 1)
    } catch {
      continue
    }
    if (raw.length === 0) continue

    const samples = raw
      .map((entry) => {
        try {
          return JSON.parse(entry) as Sample
        } catch {
          return null
        }
      })
      .filter((entry): entry is Sample => entry !== null)

    if (samples.length === 0) continue

    const durations = samples.map((sample) => sample.ms).sort((a, b) => a - b)
    const errors4xx = samples.filter((s) => s.status >= 400 && s.status < 500).length
    const errors5xx = samples.filter((s) => s.status >= 500).length

    endpoints.push({
      endpoint,
      calls: samples.length,
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      p99: percentile(durations, 99),
      max: durations[durations.length - 1],
      errors4xx,
      errors5xx,
      errorRate: ((errors4xx + errors5xx) / samples.length) * 100,
    })
  }

  endpoints.sort((a, b) => b.p95 - a.p95)

  let hourly: Array<{ hour: string; label: string; calls: number }> = []
  try {
    const buckets = await redis.hgetall(HOURLY_KEY)
    const now = new Date()
    hourly = Array.from({ length: 24 }, (_, index) => {
      const at = new Date(now.getTime() - (23 - index) * 3_600_000)
      const hour = at.toISOString().slice(0, 13)
      return {
        hour,
        label: `${String(at.getUTCHours()).padStart(2, "0")}:00`,
        calls: Number(buckets[hour] ?? 0),
      }
    })
  } catch {
    hourly = []
  }

  return { endpoints, hourly, sampled: true, windowHours: 48 }
}

export type LatencyBucket = {
  hour: string
  label: string
  calls: number
  p50: number | null
  p95: number | null
  p99: number | null
}

/**
 * P50/P95/P99 by hour across every endpoint, for the 24-hour chart.
 *
 * Computed from the same capped per-endpoint sample lists the table uses, so
 * an hour whose samples have already been trimmed away reports null rather
 * than a fabricated flat line. Hours with no traffic report null too — a gap
 * in the chart, not a zero-latency hour.
 */
export async function hourlyLatency(): Promise<{
  buckets: LatencyBucket[]
  sampled: boolean
}> {
  let names: string[] = []
  try {
    names = await redis.smembers(INDEX_KEY)
  } catch {
    return { buckets: [], sampled: false }
  }

  const byHour = new Map<string, number[]>()
  for (const endpoint of names) {
    let raw: string[] = []
    try {
      raw = await redis.lrange(`${KEY_PREFIX}${endpoint}`, 0, MAX_SAMPLES - 1)
    } catch {
      continue
    }
    for (const line of raw) {
      let sample: Sample
      try {
        sample = JSON.parse(line) as Sample
      } catch {
        continue
      }
      const hour = new Date(sample.at).toISOString().slice(0, 13)
      const bucket = byHour.get(hour)
      if (bucket) bucket.push(sample.ms)
      else byHour.set(hour, [sample.ms])
    }
  }

  const now = new Date()
  const buckets = Array.from({ length: 24 }, (_, index) => {
    const at = new Date(now.getTime() - (23 - index) * 3_600_000)
    const hour = at.toISOString().slice(0, 13)
    const samples = (byHour.get(hour) ?? []).sort((a, b) => a - b)
    return {
      hour,
      label: `${String(at.getUTCHours()).padStart(2, "0")}:00`,
      calls: samples.length,
      p50: samples.length > 0 ? percentile(samples, 50) : null,
      p95: samples.length > 0 ? percentile(samples, 95) : null,
      p99: samples.length > 0 ? percentile(samples, 99) : null,
    }
  })

  return { buckets, sampled: names.length > 0 }
}
