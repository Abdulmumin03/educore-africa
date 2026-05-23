import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { HOSTEL_ADMIN_ROLES, HOSTEL_WRITE_ROLES } from "@/lib/hostel-helpers"

export const runtime = "nodejs"

const createSchema = z.object({
  hostelId: z.string().cuid(),
  name: z.string().trim().min(1).max(60),
  description: z.string().max(500).optional(),
})

/** GET /api/hostel/dorms?hostelId= — list dorms with room counts. */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!HOSTEL_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const hostelId = url.searchParams.get("hostelId")
  if (!hostelId) return NextResponse.json({ error: "hostelId required" }, { status: 422 })

  const hostel = await prisma.hostel.findFirst({
    where: { id: hostelId, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!hostel) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const dorms = await prisma.hostelDorm.findMany({
    where: { hostelId, deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      rooms: {
        where: { deletedAt: null },
        select: {
          id: true,
          capacity: true,
          _count: {
            select: {
              assignments: { where: { deletedAt: null, toDate: null } },
            },
          },
        },
      },
    },
  })

  return NextResponse.json({
    items: dorms.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      roomCount: d.rooms.length,
      totalBeds: d.rooms.reduce((s, r) => s + r.capacity, 0),
      occupied: d.rooms.reduce((s, r) => s + r._count.assignments, 0),
    })),
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
  const { hostelId, name, description } = parsed.data

  const hostel = await prisma.hostel.findFirst({
    where: { id: hostelId, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!hostel) return NextResponse.json({ error: "Invalid hostel" }, { status: 422 })

  try {
    const created = await prisma.hostelDorm.create({
      data: { hostelId, name, description: description ?? null },
      select: { id: true },
    })
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && /Unique constraint/i.test(err.message)) {
      return NextResponse.json(
        { error: "Dorm with that name already exists in this hostel." },
        { status: 409 },
      )
    }
    throw err
  }
}
