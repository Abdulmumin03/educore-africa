import { redis } from "@/lib/redis"

import { normalisePath } from "@/lib/api-metrics"

// API error monitor.
//
// Same honesty boundary as lib/api-metrics: there is no APM and no shared
// error table. What this captures is precisely the rejections the SESSION
// GUARD produces — an expired or revoked session, a session from a blocked
// address, a deactivated account — plus whatever a caller records explicitly.
//
// It does NOT see two things, and the page says both:
//   - the school app, which has its own process and no shared error store
//   - "not signed in" 401s, which the console's edge middleware answers before
//     any route runs; those are noise anyway, not failures worth watching
//
// Every row here is a real failure that got past the front door.

const LOG_KEY = "apierr:log"
const RATE_KEY = "apierr:rate:"
const LOG_MAX = 500
const TTL_SECONDS = 48 * 60 * 60

/** An endpoint is flagged once this share of its calls fail. */
export const SPIKE_THRESHOLD_PERCENT = 10
/** …but only once there are enough calls for a rate to mean anything. */
export const SPIKE_MIN_CALLS = 10

export type ApiErrorEntry = {
  id: string
  at: number
  endpoint: string
  method: string
  status: number
  message: string
  schoolId: string | null
}

/** Pull a school id out of a console path so an error can be attributed. */
export function schoolIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/schools\/([a-z0-9]{20,})/i)
  return match ? match[1] : null
}

/** Fire-and-forget. Recording an error must never turn into a second error. */
export async function recordError(input: {
  pathname: string
  method: string
  status: number
  message: string
  schoolId?: string | null
}): Promise<void> {
  const endpoint = normalisePath(input.pathname)
  const entry: ApiErrorEntry = {
    id: `${Date.now().toString(36)}-${Math.round(Math.random() * 1e6).toString(36)}`,
    at: Date.now(),
    endpoint,
    method: input.method,
    status: input.status,
    message: input.message.slice(0, 300),
    schoolId: input.schoolId ?? schoolIdFromPath(input.pathname),
  }

  try {
    await redis
      .multi()
      .lpush(LOG_KEY, JSON.stringify(entry))
      .ltrim(LOG_KEY, 0, LOG_MAX - 1)
      .expire(LOG_KEY, TTL_SECONDS)
      .hincrby(`${RATE_KEY}${endpoint}`, "errors", 1)
      .expire(`${RATE_KEY}${endpoint}`, TTL_SECONDS)
      .exec()
  } catch {
    // Redis down — drop it rather than fail the request.
  }
}

/** Counts every call so the error RATE has a denominator. */
export async function recordCall(pathname: string): Promise<void> {
  try {
    const endpoint = normalisePath(pathname)
    await redis
      .multi()
      .hincrby(`${RATE_KEY}${endpoint}`, "total", 1)
      .expire(`${RATE_KEY}${endpoint}`, TTL_SECONDS)
      .exec()
  } catch {
    // Best-effort.
  }
}

export type EndpointErrorRate = {
  endpoint: string
  total: number
  errors: number
  errorRate: number
  /** True once the rate crosses the threshold on a meaningful sample. */
  spiking: boolean
}

export async function errorLog(options: {
  since?: Date
  endpoint?: string
  minStatus?: number
  limit?: number
}): Promise<{
  entries: Array<ApiErrorEntry & { count: number }>
  rates: EndpointErrorRate[]
  spikes: EndpointErrorRate[]
  captured: boolean
  windowHours: number
}> {
  let raw: string[] = []
  try {
    raw = await redis.lrange(LOG_KEY, 0, LOG_MAX - 1)
  } catch {
    return { entries: [], rates: [], spikes: [], captured: false, windowHours: 48 }
  }

  const sinceMs = options.since?.getTime() ?? 0
  const minStatus = options.minStatus ?? 400
  const limit = Math.min(500, Math.max(1, options.limit ?? 100))

  const parsed = raw
    .map((line) => {
      try {
        return JSON.parse(line) as ApiErrorEntry
      } catch {
        return null
      }
    })
    .filter((entry): entry is ApiErrorEntry => entry !== null)
    .filter((entry) => entry.at >= sinceMs)
    .filter((entry) => entry.status >= minStatus)
    .filter((entry) => !options.endpoint || entry.endpoint === options.endpoint)

  // Collapse identical failures. Fifty rows of the same 401 on the same
  // endpoint is one problem, and listing it fifty times hides the others.
  const grouped = new Map<string, ApiErrorEntry & { count: number }>()
  for (const entry of parsed) {
    const key = `${entry.endpoint}|${entry.method}|${entry.status}|${entry.message}`
    const existing = grouped.get(key)
    if (existing) {
      existing.count += 1
      if (entry.at > existing.at) existing.at = entry.at
      continue
    }
    grouped.set(key, { ...entry, count: 1 })
  }

  const entries = [...grouped.values()].sort((a, b) => b.at - a.at).slice(0, limit)

  // Rates per endpoint.
  const rates: EndpointErrorRate[] = []
  try {
    const keys = await redis.keys(`${redis.options.keyPrefix ?? ""}${RATE_KEY}*`)
    // ioredis prepends keyPrefix on write but KEYS returns the prefixed name,
    // so strip it back off before reading through the same client.
    const prefix = redis.options.keyPrefix ?? ""
    for (const prefixed of keys) {
      const key = prefixed.startsWith(prefix) ? prefixed.slice(prefix.length) : prefixed
      const counts = await redis.hgetall(key)
      const total = Number(counts.total ?? 0)
      const errors = Number(counts.errors ?? 0)
      if (total === 0 && errors === 0) continue
      const endpoint = key.slice(RATE_KEY.length)
      const denominator = Math.max(total, errors)
      rates.push({
        endpoint,
        total: denominator,
        errors,
        errorRate: denominator > 0 ? (errors / denominator) * 100 : 0,
        spiking:
          denominator >= SPIKE_MIN_CALLS && (errors / denominator) * 100 > SPIKE_THRESHOLD_PERCENT,
      })
    }
  } catch {
    // Rates unavailable; the log still renders.
  }

  rates.sort((a, b) => b.errorRate - a.errorRate || b.errors - a.errors)

  return {
    entries,
    rates,
    spikes: rates.filter((rate) => rate.spiking),
    captured: true,
    windowHours: 48,
  }
}
