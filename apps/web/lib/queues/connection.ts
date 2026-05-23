import IORedis from "ioredis"

/**
 * Dedicated ioredis connection for BullMQ. BullMQ requires
 * `maxRetriesPerRequest: null` so blocking commands (BRPOPLPUSH) work.
 * Keep this isolated from the cache client in `lib/redis.ts`.
 */
const globalForBullConnection = globalThis as unknown as {
  bullConnection: IORedis | undefined
}

export const bullConnection =
  globalForBullConnection.bullConnection ??
  new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  })

if (process.env.NODE_ENV !== "production") {
  globalForBullConnection.bullConnection = bullConnection
}

bullConnection.on("error", (err) => {
  // Don't crash — log so dev sees it and decides whether the worker is running.
  console.error("[bull/redis]", err.message)
})
