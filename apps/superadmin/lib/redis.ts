import Redis from "ioredis"

const globalForRedis = globalThis as unknown as { superadminRedis: Redis | undefined }

export const redis =
  globalForRedis.superadminRedis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    // Console keys are namespaced so they can be flushed without touching
    // the school app's cache entries.
    keyPrefix: "sa:",
  })

if (process.env.NODE_ENV !== "production") globalForRedis.superadminRedis = redis

/** Read-through cache helper. Returns the fresh value on any Redis failure. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  try {
    const hit = await redis.get(key)
    if (hit) return JSON.parse(hit) as T
  } catch {
    // Redis down — fall through to the live fetch rather than 500.
  }

  const value = await fetcher()

  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds)
  } catch {
    // Non-fatal.
  }

  return value
}
