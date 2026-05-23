import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { HOSTEL_WRITE_ROLES } from "@/lib/hostel-helpers"

export const runtime = "nodejs"

const createSchema = z.object({
  hostelId: z.string().cuid(),
  roomId: z.string().cuid().nullable().optional(),
  issueType: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(2000),
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!HOSTEL_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const status = url.searchParams.get("status")
  const hostelId = url.searchParams.get("hostelId") ?? undefined

  const where: Prisma.MaintenanceRequestWhereInput = {
    schoolId: session.user.schoolId,
    deletedAt: null,
  }
  if (hostelId) where.hostelId = hostelId
  if (status && /^(OPEN|IN_PROGRESS|RESOLVED|DECLINED)$/.test(status)) {
    where.status = status as Prisma.MaintenanceRequestWhereInput["status"]
  }

  const rows = await prisma.maintenanceRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      hostel: { select: { id: true, name: true } },
      room: { select: { id: true, roomNo: true } },
      reportedBy: {
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      resolvedBy: {
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  })

  return NextResponse.json({
    items: rows.map((m) => ({
      id: m.id,
      hostel: m.hostel,
      room: m.room,
      issueType: m.issueType,
      description: m.description,
      status: m.status,
      reportedBy: `${m.reportedBy.user.firstName} ${m.reportedBy.user.lastName}`,
      resolvedBy: m.resolvedBy
        ? `${m.resolvedBy.user.firstName} ${m.resolvedBy.user.lastName}`
        : null,
      resolvedAt: m.resolvedAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!HOSTEL_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data

  const [hostel, room, staff] = await Promise.all([
    prisma.hostel.findFirst({
      where: { id: data.hostelId, schoolId: session.user.schoolId, deletedAt: null },
      select: { id: true },
    }),
    data.roomId
      ? prisma.hostelRoom.findFirst({
          where: {
            id: data.roomId,
            hostelId: data.hostelId,
            deletedAt: null,
          },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.staff.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    }),
  ])
  if (!hostel) return NextResponse.json({ error: "Invalid hostel" }, { status: 422 })
  if (data.roomId && !room) {
    return NextResponse.json({ error: "Invalid room" }, { status: 422 })
  }
  if (!staff) {
    return NextResponse.json({ error: "Only staff can report issues" }, { status: 403 })
  }

  const created = await prisma.maintenanceRequest.create({
    data: {
      schoolId: session.user.schoolId,
      hostelId: data.hostelId,
      roomId: data.roomId ?? null,
      issueType: data.issueType,
      description: data.description,
      reportedById: staff.id,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
}
