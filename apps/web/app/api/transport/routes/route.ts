import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { TRANSPORT_WRITE_ROLES } from "@/lib/transport-helpers"

export const runtime = "nodejs"

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  busPlateNo: z.string().trim().min(2).max(20),
  make: z.string().trim().max(40).optional(),
  model: z.string().trim().max(40).optional(),
  driverName: z.string().trim().max(80).optional(),
  driverPhone: z.string().trim().max(20).optional(),
  driverStaffId: z.string().cuid().nullable().optional(),
  capacity: z.number().int().min(1).max(120).default(20),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const rows = await prisma.busRoute.findMany({
    where: { schoolId: session.user.schoolId, deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      driverStaff: {
        select: { id: true, user: { select: { firstName: true, lastName: true } } },
      },
      stops: {
        where: { deletedAt: null },
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          sequence: true,
          name: true,
          address: true,
          latitude: true,
          longitude: true,
          scheduledTime: true,
        },
      },
      _count: { select: { assignments: { where: { deletedAt: null, isActive: true } } } },
    },
  })

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      busPlateNo: r.busPlateNo,
      make: r.make,
      model: r.model,
      driverName: r.driverName,
      driverPhone: r.driverPhone,
      driverStaff: r.driverStaff
        ? {
            id: r.driverStaff.id,
            name: `${r.driverStaff.user.firstName} ${r.driverStaff.user.lastName}`,
          }
        : null,
      capacity: r.capacity,
      stops: r.stops,
      assignedCount: r._count.assignments,
    })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!TRANSPORT_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data

  if (data.driverStaffId) {
    const staff = await prisma.staff.findFirst({
      where: { id: data.driverStaffId, schoolId: session.user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!staff) return NextResponse.json({ error: "Invalid driver staff" }, { status: 422 })
  }

  try {
    const created = await prisma.busRoute.create({
      data: {
        schoolId: session.user.schoolId,
        name: data.name,
        busPlateNo: data.busPlateNo.toUpperCase(),
        make: data.make ?? null,
        model: data.model ?? null,
        driverName: data.driverName ?? null,
        driverPhone: data.driverPhone ?? null,
        driverStaffId: data.driverStaffId ?? null,
        capacity: data.capacity,
      },
      select: { id: true },
    })
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && /Unique constraint/i.test(err.message)) {
      return NextResponse.json(
        { error: "A route with that plate number already exists." },
        { status: 409 },
      )
    }
    throw err
  }
}
