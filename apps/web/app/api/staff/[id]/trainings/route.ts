import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { resolveStaffAccess } from "@/lib/staff-access"

export const runtime = "nodejs"

const createSchema = z.object({
  title: z.string().trim().min(2).max(160),
  provider: z.string().trim().max(120).optional().or(z.literal("")),
  type: z.enum(["CERTIFICATION", "COURSE", "WORKSHOP", "CONFERENCE", "IN_HOUSE"]).default("COURSE"),
  startDate: z.string().min(1),
  endDate: z.string().optional().or(z.literal("")),
  certificateUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
})

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response

  const staff = await prisma.staff.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!staff) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const rows = await prisma.trainingLog.findMany({
    where: { staffId: staff.id, deletedAt: null },
    orderBy: { startDate: "desc" },
  })

  return NextResponse.json({
    items: rows.map((t) => ({
      id: t.id,
      title: t.title,
      provider: t.provider,
      type: t.type,
      startDate: t.startDate.toISOString(),
      endDate: t.endDate?.toISOString() ?? null,
      certificateUrl: t.certificateUrl,
      notes: t.notes,
    })),
  })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response

  const staff = await prisma.staff.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true, userId: true },
  })
  if (!staff) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Staff can log their own training; admins can log for anyone.
  const isSelf = staff.userId === access.session.userId
  const isPrivileged = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"].includes(access.session.role)
  if (!isSelf && !isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const created = await prisma.trainingLog.create({
    data: {
      schoolId: access.session.schoolId,
      staffId: staff.id,
      title: parsed.data.title,
      provider: parsed.data.provider || null,
      type: parsed.data.type,
      startDate: new Date(parsed.data.startDate),
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      certificateUrl: parsed.data.certificateUrl || null,
      notes: parsed.data.notes || null,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
}
