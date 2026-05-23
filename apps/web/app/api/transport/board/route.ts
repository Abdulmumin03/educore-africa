import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { sendSms } from "@/lib/sms"
import { TRANSPORT_DRIVER_ROLES } from "@/lib/transport-helpers"

export const runtime = "nodejs"

const bodySchema = z.object({
  studentId: z.string().cuid(),
})

/**
 * POST /api/transport/board — mark a student as having boarded their assigned
 * route. Driver / admin only. Sends a "Your child boarded route X" SMS to the
 * primary parent. Deduped per (student, day) via AuditLog so a re-tap is safe.
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
  const { studentId } = parsed.data

  const assignment = await prisma.studentRouteAssignment.findFirst({
    where: {
      studentId,
      schoolId: session.user.schoolId,
      isActive: true,
      deletedAt: null,
    },
    include: {
      route: { select: { id: true, name: true, driverStaffId: true } },
      stop: { select: { id: true, name: true } },
      student: {
        select: {
          id: true,
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
  if (!assignment) {
    return NextResponse.json(
      { error: "Student isn't assigned to any route." },
      { status: 404 },
    )
  }

  // Drivers can only board students on their own route.
  if (session.user.role === "DRIVER") {
    const myStaff = await prisma.staff.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!myStaff || assignment.route.driverStaffId !== myStaff.id) {
      return NextResponse.json(
        { error: "You aren't the driver for this student's route." },
        { status: 403 },
      )
    }
  }

  const day = new Date().toISOString().slice(0, 10)
  const action = `transport:board:${day}`
  const dedupe = await prisma.auditLog.findFirst({
    where: {
      schoolId: session.user.schoolId,
      action,
      entityType: "Student",
      entityId: assignment.student.id,
    },
    select: { id: true },
  })
  if (dedupe) {
    return NextResponse.json({ ok: true, deduped: true })
  }

  await prisma.auditLog.create({
    data: {
      schoolId: session.user.schoolId,
      userId: session.user.id,
      action,
      entityType: "Student",
      entityId: assignment.student.id,
      payload: { routeId: assignment.routeId, stopId: assignment.stopId },
    },
  })

  // Fire SMS to primary parent (fire-and-forget).
  const phone = assignment.student.parents[0]?.parent.user.phone
  const studentName = `${assignment.student.user.firstName} ${assignment.student.user.lastName}`
  if (phone) {
    void sendSms(
      phone,
      `${studentName} has boarded the school bus on ${assignment.route.name} at ${assignment.stop.name}. Safe trip.`,
    ).catch((err) => console.error("[transport] board sms failed", err))
  }

  return NextResponse.json({ ok: true, deduped: false })
}

/**
 * GET /api/transport/board?routeId= — list students assigned to a route plus
 * their "boarded today" status. Powers the driver/admin boarding roster UI.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!TRANSPORT_DRIVER_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const routeId = url.searchParams.get("routeId")
  if (!routeId) return NextResponse.json({ error: "routeId required" }, { status: 422 })

  const route = await prisma.busRoute.findFirst({
    where: { id: routeId, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true, driverStaffId: true, name: true },
  })
  if (!route) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (session.user.role === "DRIVER") {
    const myStaff = await prisma.staff.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!myStaff || route.driverStaffId !== myStaff.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const day = new Date().toISOString().slice(0, 10)
  const action = `transport:board:${day}`

  const [assignments, boarded] = await Promise.all([
    prisma.studentRouteAssignment.findMany({
      where: { routeId, isActive: true, deletedAt: null },
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            user: { select: { firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        stop: { select: { id: true, name: true, sequence: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: {
        schoolId: session.user.schoolId,
        action,
        entityType: "Student",
      },
      select: { entityId: true, createdAt: true },
    }),
  ])

  const boardedMap = new Map(
    boarded.filter((b) => b.entityId).map((b) => [b.entityId!, b.createdAt]),
  )

  return NextResponse.json({
    route: { id: route.id, name: route.name },
    items: assignments
      .map((a) => ({
        studentId: a.student.id,
        admissionNumber: a.student.admissionNumber,
        firstName: a.student.user.firstName,
        lastName: a.student.user.lastName,
        avatarUrl: a.student.user.avatarUrl,
        stop: a.stop,
        boardedAt: boardedMap.get(a.student.id)?.toISOString() ?? null,
      }))
      .sort((a, b) => {
        if (a.stop.sequence !== b.stop.sequence) return a.stop.sequence - b.stop.sequence
        return a.lastName.localeCompare(b.lastName)
      }),
  })
}
