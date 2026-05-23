import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"

/**
 * Tiny Redis-backed memo. Returns the cached value when fresh, otherwise runs
 * `fetcher`, stores the result with `ttlSeconds`, and returns it. Errors from
 * Redis are swallowed — a downed cache falls back to a live fetch.
 *
 * Use for read-mostly server data (school settings, dashboard rollups, AI
 * outputs). DON'T use for per-user data or anything sensitive in a payload.
 *
 * Pass `bust: true` to force a refresh, even if a cached entry exists.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
  opts: { bust?: boolean } = {},
): Promise<{ data: T; cached: boolean }> {
  if (!opts.bust) {
    try {
      const raw = await redis.get(key)
      if (raw) return { data: JSON.parse(raw) as T, cached: true }
    } catch (err) {
      console.error("[cache] get failed", key, err)
    }
  }
  const data = await fetcher()
  try {
    await redis.set(key, JSON.stringify(data), "EX", ttlSeconds)
  } catch (err) {
    console.error("[cache] set failed", key, err)
  }
  return { data, cached: false }
}

/**
 * Drop a cache key. Call from write paths so the next read recomputes.
 */
export async function invalidate(key: string): Promise<void> {
  try {
    await redis.del(key)
  } catch (err) {
    console.error("[cache] del failed", key, err)
  }
}

/**
 * Common TTLs in seconds — single source of truth so the spec values stay
 * consistent across endpoints.
 */
export const TTL = {
  dashboardExec: 5 * 60, // 5 min
  schoolSettings: 60 * 60, // 1 h
  aiInsights: 6 * 60 * 60, // 6 h (matches existing school-insights endpoint)
} as const

export const cacheKey = {
  dashboardExec: (schoolId: string) => `dashboard:exec:${schoolId}`,
  schoolSettings: (schoolId: string) => `school:settings:${schoolId}`,
} as const

export type SchoolSettings = {
  id: string
  name: string
  slug: string
  currency: string
  timezone: string
  logoUrl: string | null
  settings: unknown // School.settings is Json — caller knows the shape
}

/**
 * Read-mostly school metadata + settings JSON. Cached 1h. Call `invalidate`
 * from any route that mutates the School row (logo upload, settings update).
 */
export async function getCachedSchoolSettings(
  schoolId: string,
): Promise<SchoolSettings | null> {
  const { data } = await cached<SchoolSettings | null>(
    cacheKey.schoolSettings(schoolId),
    TTL.schoolSettings,
    async () => {
      const s = await prisma.school.findFirst({
        where: { id: schoolId, deletedAt: null },
        select: {
          id: true,
          name: true,
          slug: true,
          currency: true,
          timezone: true,
          logoUrl: true,
          settings: true,
        },
      })
      return s
    },
  )
  return data
}
