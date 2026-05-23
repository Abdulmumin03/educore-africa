import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { HOSTEL_ADMIN_ROLES } from "@/lib/hostel-helpers"

export const runtime = "nodejs"

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  gender: z.enum(["MALE", "FEMALE", "MIXED"]),
  hostelMasterId: z.string().cuid().nullable().optional(),
  capacity: z.number().int().min(0).max(2000).default(0),
})

/**
 * GET /api/hostel/hostels — list hostels + room counts + occupancy.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const rows = await prisma.hostel.findMany({
    where: { schoolId: session.user.schoolId, deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      rooms: {
        where: { deletedAt: null },
        select: {
          id: true,
          capacity: true,
          _count: {
            select: {
              assignments: {
                where: { deletedAt: null, toDate: null },
              },
            },
          },
        },
      },
      hostelMaster: {
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  })

  return NextResponse.json({
    items: rows.map((h) => {
      const totalBeds = h.rooms.reduce((s, r) => s + r.capacity, 0)
      const occupied = h.rooms.reduce((s, r) => s + r._count.assignments, 0)
      return {
        id: h.id,
        name: h.name,
        gender: h.gender,
        capacity: h.capacity || totalBeds, // use room sum when capacity isn't set
        roomCount: h.rooms.length,
        totalBeds,
        occupied,
        available: Math.max(0, totalBeds - occupied),
        hostelMaster: h.hostelMaster
          ? {
              id: h.hostelMaster.id,
              name: `${h.hostelMaster.user.firstName} ${h.hostelMaster.user.lastName}`,
            }
          : null,
      }
    }),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!HOSTEL_ADMIN_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data

  if (data.hostelMasterId) {
    const staff = await prisma.staff.findFirst({
      where: { id: data.hostelMasterId, schoolId: session.user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!staff) return NextResponse.json({ error: "Invalid houseparent" }, { status: 422 })
  }

  try {
    const created = await prisma.hostel.create({
      data: {
        schoolId: session.user.schoolId,
        name: data.name,
        gender: data.gender,
        hostelMasterId: data.hostelMasterId ?? null,
        capacity: data.capacity,
      },
      select: { id: true },
    })
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && /Unique constraint/i.test(err.message)) {
      return NextResponse.json(
        { error: "A hostel with that name already exists." },
        { status: 409 },
      )
    }
    throw err
  }
}
