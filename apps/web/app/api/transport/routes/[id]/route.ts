import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { TRANSPORT_WRITE_ROLES } from "@/lib/transport-helpers"

export const runtime = "nodejs"

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  busPlateNo: z.string().trim().min(2).max(20).optional(),
  make: z.string().trim().max(40).nullable().optional(),
  model: z.string().trim().max(40).nullable().optional(),
  driverName: z.string().trim().max(80).nullable().optional(),
  driverPhone: z.string().trim().max(20).nullable().optional(),
  driverStaffId: z.string().cuid().nullable().optional(),
  capacity: z.number().int().min(1).max(120).optional(),
})

async function load(id: string, schoolId: string) {
  return prisma.busRoute.findFirst({
    where: { id, schoolId, deletedAt: null },
    select: { id: true },
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!TRANSPORT_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const r = await load(params.id, session.user.schoolId)
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data
  const patch: Prisma.BusRouteUpdateInput = {}
  if (data.name !== undefined) patch.name = data.name
  if (data.busPlateNo !== undefined) patch.busPlateNo = data.busPlateNo.toUpperCase()
  if (data.make !== undefined) patch.make = data.make
  if (data.model !== undefined) patch.model = data.model
  if (data.driverName !== undefined) patch.driverName = data.driverName
  if (data.driverPhone !== undefined) patch.driverPhone = data.driverPhone
  if (data.capacity !== undefined) patch.capacity = data.capacity
  if (data.driverStaffId !== undefined) {
    patch.driverStaff = data.driverStaffId
      ? { connect: { id: data.driverStaffId } }
      : { disconnect: true }
  }

  await prisma.busRoute.update({ where: { id: r.id }, data: patch })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!TRANSPORT_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const r = await load(params.id, session.user.schoolId)
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const assigned = await prisma.studentRouteAssignment.count({
    where: { routeId: r.id, isActive: true, deletedAt: null },
  })
  if (assigned > 0) {
    return NextResponse.json(
      {
        error: `Can't delete — ${assigned} student${assigned === 1 ? "" : "s"} still assigned to this route.`,
      },
      { status: 409 },
    )
  }

  await prisma.busRoute.update({
    where: { id: r.id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
