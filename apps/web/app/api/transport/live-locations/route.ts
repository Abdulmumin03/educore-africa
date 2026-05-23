import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import { busLocationKey } from "@/lib/transport-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type CachedPosition = {
  routeId: string
  latitude: number
  longitude: number
  speedKph: number | null
  recordedAt: string
}

/**
 * GET /api/transport/live-locations — current positions of every route's bus.
 *
 * Reads Redis first (live, <90s old). Falls back to the latest BusTracking row
 * when Redis is cold (no ping in the last 90s OR Redis unreachable).
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const routes = await prisma.busRoute.findMany({
    where: { schoolId: session.user.schoolId, deletedAt: null },
    select: {
      id: true,
      name: true,
      busPlateNo: true,
      driverName: true,
    },
  })
  if (routes.length === 0) return NextResponse.json({ items: [] })

  const keys = routes.map((r) => busLocationKey(r.id))
  const cached = await redis.mget(...keys).catch(() => routes.map(() => null))

  const fresh: Record<string, CachedPosition> = {}
  for (let i = 0; i < routes.length; i++) {
    const raw = cached[i]
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as CachedPosition
      fresh[routes[i].id] = parsed
    } catch {
      /* ignore malformed cache entries */
    }
  }

  // For routes with no live cache, fall back to the latest DB row.
  const missing = routes.filter((r) => !fresh[r.id]).map((r) => r.id)
  const fallback = missing.length
    ? await prisma.busTracking.findMany({
        where: { routeId: { in: missing } },
        orderBy: { recordedAt: "desc" },
        distinct: ["routeId"],
        select: {
          routeId: true,
          latitude: true,
          longitude: true,
          speedKph: true,
          recordedAt: true,
        },
      })
    : []
  const fallbackByRoute = new Map(fallback.map((f) => [f.routeId, f]))

  return NextResponse.json({
    now: new Date().toISOString(),
    items: routes.map((r) => {
      const live = fresh[r.id]
      const fb = !live ? fallbackByRoute.get(r.id) : null
      const pos = live ?? (fb ? { ...fb, recordedAt: fb.recordedAt.toISOString() } : null)
      return {
        routeId: r.id,
        name: r.name,
        busPlateNo: r.busPlateNo,
        driverName: r.driverName,
        position: pos
          ? {
              latitude: pos.latitude,
              longitude: pos.longitude,
              speedKph: pos.speedKph ?? null,
              recordedAt: pos.recordedAt,
              live: !!live,
            }
          : null,
      }
    }),
  })
}
