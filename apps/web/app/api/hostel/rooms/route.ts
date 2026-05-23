import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { HOSTEL_WRITE_ROLES } from "@/lib/hostel-helpers"

export const runtime = "nodejs"

const createSchema = z.object({
  hostelId: z.string().cuid(),
  dormId: z.string().cuid().nullable().optional(),
  roomNo: z.string().trim().min(1).max(20),
  capacity: z.number().int().min(1).max(20),
})

/** GET /api/hostel/rooms?hostelId= — list rooms with bed-occupancy detail. */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const url = new URL(req.url)
  const hostelId = url.searchParams.get("hostelId")
  if (!hostelId) return NextResponse.json({ error: "hostelId required" }, { status: 422 })

  const hostel = await prisma.hostel.findFirst({
    where: { id: hostelId, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true, name: true, gender: true },
  })
  if (!hostel) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const rooms = await prisma.hostelRoom.findMany({
    where: { hostelId, deletedAt: null },
    orderBy: { roomNo: "asc" },
    include: {
      dorm: { select: { id: true, name: true } },
      assignments: {
        where: { deletedAt: null, toDate: null },
        select: {
          id: true,
          bedNumber: true,
          fromDate: true,
          student: {
            select: {
              id: true,
              admissionNumber: true,
              gender: true,
              user: { select: { firstName: true, lastName: true, avatarUrl: true } },
            },
          },
        },
      },
    },
  })

  return NextResponse.json({
    hostel,
    rooms: rooms.map((r) => ({
      id: r.id,
      roomNo: r.roomNo,
      capacity: r.capacity,
      dorm: r.dorm,
      beds: Array.from({ length: r.capacity }, (_, i) => {
        const bedNumber = i + 1
        const assigned = r.assignments.find((a) => a.bedNumber === bedNumber)
        return {
          bedNumber,
          assignment: assigned
            ? {
                id: assigned.id,
                fromDate: assigned.fromDate.toISOString(),
                student: {
                  id: assigned.student.id,
                  admissionNumber: assigned.student.admissionNumber,
                  firstName: assigned.student.user.firstName,
                  lastName: assigned.student.user.lastName,
                  avatarUrl: assigned.student.user.avatarUrl,
                  gender: assigned.student.gender,
                },
              }
            : null,
        }
      }),
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
  const { hostelId, dormId, roomNo, capacity } = parsed.data

  const hostel = await prisma.hostel.findFirst({
    where: { id: hostelId, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!hostel) return NextResponse.json({ error: "Invalid hostel" }, { status: 422 })

  if (dormId) {
    const dorm = await prisma.hostelDorm.findFirst({
      where: { id: dormId, hostelId, deletedAt: null },
      select: { id: true },
    })
    if (!dorm) {
      return NextResponse.json(
        { error: "Dorm doesn't belong to that hostel." },
        { status: 422 },
      )
    }
  }

  try {
    const created = await prisma.hostelRoom.create({
      data: { hostelId, dormId: dormId ?? null, roomNo, capacity },
      select: { id: true },
    })
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && /Unique constraint/i.test(err.message)) {
      return NextResponse.json(
        { error: "Room number already exists in this hostel." },
        { status: 409 },
      )
    }
    throw err
  }
}
