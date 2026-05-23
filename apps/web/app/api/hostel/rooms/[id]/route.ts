import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { HOSTEL_WRITE_ROLES } from "@/lib/hostel-helpers"

export const runtime = "nodejs"

const patchSchema = z.object({
  roomNo: z.string().trim().min(1).max(20).optional(),
  capacity: z.number().int().min(1).max(20).optional(),
})

async function load(id: string, schoolId: string) {
  return prisma.hostelRoom.findFirst({
    where: {
      id,
      deletedAt: null,
      hostel: { schoolId, deletedAt: null },
    },
    select: { id: true, capacity: true },
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
  if (!HOSTEL_WRITE_ROLES.includes(session.user.role))
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

  // Refuse capacity shrink below highest occupied bedNumber.
  if (data.capacity !== undefined && data.capacity < r.capacity) {
    const maxBed = await prisma.hostelAssignment.aggregate({
      where: { roomId: r.id, deletedAt: null, toDate: null },
      _max: { bedNumber: true },
    })
    if (maxBed._max.bedNumber && data.capacity < maxBed._max.bedNumber) {
      return NextResponse.json(
        {
          error: `Cannot shrink below bed #${maxBed._max.bedNumber} — currently occupied.`,
        },
        { status: 409 },
      )
    }
  }

  await prisma.hostelRoom.update({ where: { id: r.id }, data })
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
  if (!HOSTEL_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const r = await load(params.id, session.user.schoolId)
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const active = await prisma.hostelAssignment.count({
    where: { roomId: r.id, deletedAt: null, toDate: null },
  })
  if (active > 0) {
    return NextResponse.json(
      { error: "Can't delete — room has active assignments." },
      { status: 409 },
    )
  }

  await prisma.hostelRoom.update({
    where: { id: r.id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
