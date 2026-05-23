import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import {
  LIVE_TTL_SECONDS,
  TRANSPORT_DRIVER_ROLES,
  busLocationKey,
} from "@/lib/transport-helpers"
import { haversine, pointToPolylineDistance } from "@/lib/geofence"
import { sendSms } from "@/lib/sms"

export const runtime = "nodejs"

const GEOFENCE_DEVIATION_M = 500 // spec: alert if bus >500m from route
const NEAR_STOP_RADIUS_M = 2_000 // spec: notify parents within 2km of stop

const bodySchema = z.object({
  routeId: z.string().cuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speedKph: z.number().min(0).max(300).optional(),
})

/**
 * POST /api/transport/update-location
 *
 * Driver app posts the current bus position. Dual-write:
 *   • Redis `bus:route:<id>` (90 s TTL) — fast read for the live map
 *   • BusTracking row — durable history
 *
 * Drivers may only post for routes they're assigned to (driverStaffId match).
 * Admins can post on behalf for testing.
 *
 * Side effects (fire-and-forget, never fail the ping):
 *   • Geofence check — alert admins if bus is >500m from the route polyline.
 *   • Near-stop SMS — notify parents of students assigned to a stop when
 *     the bus comes within 2 km of that stop (once per stop per day).
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!TRANSPORT_DRIVER_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { routeId, latitude, longitude, speedKph } = parsed.data

  const route = await prisma.busRoute.findFirst({
    where: { id: routeId, schoolId: session.user.schoolId, deletedAt: null },
    select: {
      id: true,
      name: true,
      schoolId: true,
      driverStaffId: true,
      stops: {
        where: { deletedAt: null, latitude: { not: null }, longitude: { not: null } },
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
        },
      },
    },
  })
  if (!route) return NextResponse.json({ error: "Invalid route" }, { status: 422 })

  if (session.user.role === "DRIVER") {
    const myStaff = await prisma.staff.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!myStaff || route.driverStaffId !== myStaff.id) {
      return NextResponse.json(
        { error: "You aren't assigned to this route." },
        { status: 403 },
      )
    }
  }

  const recordedAt = new Date()
  const payload = {
    routeId,
    latitude,
    longitude,
    speedKph: speedKph ?? null,
    recordedAt: recordedAt.toISOString(),
  }

  // Redis (best-effort) + DB (durable). Don't fail the request if Redis is down.
  await redis
    .set(busLocationKey(routeId), JSON.stringify(payload), "EX", LIVE_TTL_SECONDS)
    .catch((err) => {
      console.error("[transport] redis set failed", err)
    })

  await prisma.busTracking.create({
    data: {
      routeId,
      latitude,
      longitude,
      speedKph: speedKph ?? null,
      recordedAt,
    },
  })

  // Side-effects: never throw out of this block.
  try {
    await checkGeofenceAndNotify({
      schoolId: route.schoolId,
      routeId: route.id,
      routeName: route.name,
      stops: route.stops.map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.latitude as number,
        lng: s.longitude as number,
      })),
      busLat: latitude,
      busLng: longitude,
    })
  } catch (err) {
    console.error("[transport] side-effects failed", err)
  }

  return NextResponse.json({ ok: true, recordedAt: payload.recordedAt })
}

type GeoStop = { id: string; name: string; lat: number; lng: number }

async function checkGeofenceAndNotify(input: {
  schoolId: string
  routeId: string
  routeName: string
  stops: GeoStop[]
  busLat: number
  busLng: number
}): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)

  // Geofence deviation
  if (input.stops.length >= 2) {
    const distance = pointToPolylineDistance(
      { lat: input.busLat, lng: input.busLng },
      input.stops.map((s) => ({ lat: s.lat, lng: s.lng })),
    )
    if (distance > GEOFENCE_DEVIATION_M) {
      await emitDeviationAlertOnce({
        schoolId: input.schoolId,
        routeId: input.routeId,
        routeName: input.routeName,
        distance,
        day: today,
      })
    }
  }

  // Near-stop SMS for each stop in range
  for (const stop of input.stops) {
    const d = haversine(input.busLat, input.busLng, stop.lat, stop.lng)
    if (d <= NEAR_STOP_RADIUS_M) {
      await notifyNearStopOnce({
        schoolId: input.schoolId,
        routeId: input.routeId,
        routeName: input.routeName,
        stop,
        day: today,
      })
    }
  }
}

async function emitDeviationAlertOnce(input: {
  schoolId: string
  routeId: string
  routeName: string
  distance: number
  day: string
}): Promise<void> {
  const action = `transport:deviation:${input.day}`
  const dedupe = await prisma.auditLog.findFirst({
    where: {
      schoolId: input.schoolId,
      action,
      entityType: "BusRoute",
      entityId: input.routeId,
    },
    select: { id: true },
  })
  if (dedupe) return

  // Stamp the dedupe row first so concurrent pings don't all fire alerts.
  await prisma.auditLog.create({
    data: {
      schoolId: input.schoolId,
      action,
      entityType: "BusRoute",
      entityId: input.routeId,
      payload: { distance: Math.round(input.distance) },
    },
  })

  const admins = await prisma.user.findMany({
    where: {
      schoolId: input.schoolId,
      role: { in: ["SCHOOL_ADMIN", "PRINCIPAL", "SUPER_ADMIN"] },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  })
  if (admins.length === 0) return

  await prisma.notification.createMany({
    data: admins.map((u) => ({
      schoolId: input.schoolId,
      userId: u.id,
      channel: "IN_APP" as const,
      title: `Bus deviation: ${input.routeName}`,
      body: `Bus is ${Math.round(input.distance)}m from the planned route. Check on the driver.`,
      metadata: { routeId: input.routeId, distance: Math.round(input.distance) },
      sentAt: new Date(),
    })),
  })
}

const NIGHT_END_HOUR = 5 // skip SMS between 22:00 and 05:00
const NIGHT_START_HOUR = 22

async function notifyNearStopOnce(input: {
  schoolId: string
  routeId: string
  routeName: string
  stop: GeoStop
  day: string
}): Promise<void> {
  // Don't fire overnight pings (e.g. driver testing the route).
  const hour = new Date().getHours()
  if (hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR) return

  const action = `transport:nearstop:${input.day}`
  const dedupe = await prisma.auditLog.findFirst({
    where: {
      schoolId: input.schoolId,
      action,
      entityType: "RouteStop",
      entityId: input.stop.id,
    },
    select: { id: true },
  })
  if (dedupe) return

  await prisma.auditLog.create({
    data: {
      schoolId: input.schoolId,
      action,
      entityType: "RouteStop",
      entityId: input.stop.id,
      payload: { routeId: input.routeId },
    },
  })

  // Students assigned to this stop → primary parent phones.
  const assignments = await prisma.studentRouteAssignment.findMany({
    where: { stopId: input.stop.id, isActive: true, deletedAt: null },
    select: {
      student: {
        select: {
          user: { select: { firstName: true, lastName: true } },
          parents: {
            orderBy: { isPrimary: "desc" },
            take: 1,
            select: {
              parent: { select: { user: { select: { phone: true } } } },
            },
          },
        },
      },
    },
  })

  const message = `Your child's bus on ${input.routeName} is about 10 minutes away from ${input.stop.name}. Please be ready.`

  await Promise.allSettled(
    assignments.map(async (a) => {
      const phone = a.student.parents[0]?.parent.user.phone
      if (!phone) return
      await sendSms(phone, message)
    }),
  )
}
