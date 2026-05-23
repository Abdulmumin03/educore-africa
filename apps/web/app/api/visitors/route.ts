import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma, UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

// Anyone on staff can sign visitors in. Students/parents/drivers cannot.
const STAFF_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "BURSAR",
  "COUNSELOR",
  "LIBRARIAN",
  "HOSTEL_MASTER",
]

const listQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().max(80).optional(),
  status: z.enum(["all", "checked-in", "checked-out"]).default("all"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
})

const createSchema = z.object({
  visitorName: z.string().trim().min(2).max(160),
  visitorPhone: z.string().trim().max(20).optional(),
  idNumber: z.string().trim().max(40).optional(),
  purpose: z.string().trim().max(200).optional(),
  hostUserId: z.string().cuid().nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!STAFF_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const parsed = listQuerySchema.safeParse({
    date: url.searchParams.get("date") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 422 })
  const { date, q, status, limit } = parsed.data

  const where: Prisma.VisitorLogWhereInput = {
    schoolId: session.user.schoolId,
    deletedAt: null,
  }
  if (date) {
    const start = new Date(`${date}T00:00:00`)
    const end = new Date(`${date}T23:59:59.999`)
    where.checkedInAt = { gte: start, lte: end }
  }
  if (q) {
    where.OR = [
      { visitorName: { contains: q, mode: "insensitive" } },
      { visitorPhone: { contains: q, mode: "insensitive" } },
      { purpose: { contains: q, mode: "insensitive" } },
    ]
  }
  if (status === "checked-in") where.checkedOutAt = null
  if (status === "checked-out") where.checkedOutAt = { not: null }

  const rows = await prisma.visitorLog.findMany({
    where,
    orderBy: { checkedInAt: "desc" },
    take: limit,
    include: {
      host: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
    },
  })

  return NextResponse.json({
    items: rows.map((v) => ({
      id: v.id,
      visitorName: v.visitorName,
      visitorPhone: v.visitorPhone,
      idNumber: v.idNumber,
      purpose: v.purpose,
      photoUrl: v.photoUrl,
      checkedInAt: v.checkedInAt.toISOString(),
      checkedOutAt: v.checkedOutAt?.toISOString() ?? null,
      host: v.host
        ? {
            id: v.host.id,
            name: `${v.host.firstName} ${v.host.lastName}`,
            role: v.host.role,
          }
        : null,
    })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!STAFF_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data

  if (data.hostUserId) {
    const host = await prisma.user.findFirst({
      where: { id: data.hostUserId, schoolId: session.user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!host) return NextResponse.json({ error: "Invalid host" }, { status: 422 })
  }

  const created = await prisma.visitorLog.create({
    data: {
      schoolId: session.user.schoolId,
      visitorName: data.visitorName,
      visitorPhone: data.visitorPhone ?? null,
      idNumber: data.idNumber ?? null,
      purpose: data.purpose ?? null,
      hostUserId: data.hostUserId ?? null,
      photoUrl: data.photoUrl ?? null,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
}
