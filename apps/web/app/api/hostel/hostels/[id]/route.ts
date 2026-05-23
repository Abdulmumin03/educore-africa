import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { HOSTEL_ADMIN_ROLES } from "@/lib/hostel-helpers"

export const runtime = "nodejs"

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  gender: z.enum(["MALE", "FEMALE", "MIXED"]).optional(),
  hostelMasterId: z.string().cuid().nullable().optional(),
  capacity: z.number().int().min(0).max(2000).optional(),
})

async function load(id: string, schoolId: string) {
  return prisma.hostel.findFirst({
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
  if (!HOSTEL_ADMIN_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const h = await load(params.id, session.user.schoolId)
  if (!h) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data
  const patch: Prisma.HostelUpdateInput = {}
  if (data.name !== undefined) patch.name = data.name
  if (data.gender !== undefined) patch.gender = data.gender
  if (data.capacity !== undefined) patch.capacity = data.capacity
  if (data.hostelMasterId !== undefined) {
    patch.hostelMaster = data.hostelMasterId
      ? { connect: { id: data.hostelMasterId } }
      : { disconnect: true }
  }

  await prisma.hostel.update({ where: { id: h.id }, data: patch })
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
  if (!HOSTEL_ADMIN_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const h = await load(params.id, session.user.schoolId)
  if (!h) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Refuse delete when active assignments exist.
  const active = await prisma.hostelAssignment.count({
    where: {
      room: { hostelId: h.id, deletedAt: null },
      deletedAt: null,
      toDate: null,
    },
  })
  if (active > 0) {
    return NextResponse.json(
      { error: `Can't delete — ${active} student${active === 1 ? "" : "s"} still assigned.` },
      { status: 409 },
    )
  }

  await prisma.hostel.update({
    where: { id: h.id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
