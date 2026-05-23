import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { TRANSPORT_WRITE_ROLES } from "@/lib/transport-helpers"

export const runtime = "nodejs"

const upsertSchema = z.object({
  studentId: z.string().cuid(),
  routeId: z.string().cuid(),
  stopId: z.string().cuid(),
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const url = new URL(req.url)
  const routeId = url.searchParams.get("routeId") ?? undefined

  const rows = await prisma.studentRouteAssignment.findMany({
    where: {
      schoolId: session.user.schoolId,
      deletedAt: null,
      isActive: true,
      ...(routeId ? { routeId } : {}),
    },
    include: {
      student: {
        select: {
          id: true,
          admissionNumber: true,
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
        },
      },
      route: { select: { id: true, name: true, busPlateNo: true } },
      stop: { select: { id: true, name: true, scheduledTime: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({
    items: rows.map((a) => ({
      id: a.id,
      student: {
        id: a.student.id,
        admissionNumber: a.student.admissionNumber,
        firstName: a.student.user.firstName,
        lastName: a.student.user.lastName,
        avatarUrl: a.student.user.avatarUrl,
      },
      route: a.route,
      stop: a.stop,
    })),
  })
}

/**
 * POST /api/transport/assignments — assign or move a student.
 * StudentRouteAssignment.studentId is @unique, so this upserts. The active
 * row is replaced when the student moves to a different route/stop.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!TRANSPORT_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = upsertSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { studentId, routeId, stopId } = parsed.data
  const schoolId = session.user.schoolId

  const [student, route, stop] = await Promise.all([
    prisma.student.findFirst({
      where: { id: studentId, schoolId, deletedAt: null },
      select: { id: true },
    }),
    prisma.busRoute.findFirst({
      where: { id: routeId, schoolId, deletedAt: null },
      select: { id: true },
    }),
    prisma.routeStop.findFirst({
      where: { id: stopId, routeId, deletedAt: null },
      select: { id: true },
    }),
  ])
  if (!student) return NextResponse.json({ error: "Invalid student" }, { status: 422 })
  if (!route) return NextResponse.json({ error: "Invalid route" }, { status: 422 })
  if (!stop) return NextResponse.json({ error: "Stop doesn't belong to that route" }, { status: 422 })

  const upserted = await prisma.studentRouteAssignment.upsert({
    where: { studentId: student.id },
    create: { schoolId, studentId: student.id, routeId, stopId, isActive: true },
    update: { routeId, stopId, isActive: true, deletedAt: null },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, id: upserted.id })
}
