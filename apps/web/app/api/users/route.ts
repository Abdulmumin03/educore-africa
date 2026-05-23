import { NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { randomBytes } from "node:crypto"
import type { Prisma, UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/audit"

export const runtime = "nodejs"

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

const listQuerySchema = z.object({
  q: z.string().max(80).optional(),
  role: z.string().max(40).optional(),
  status: z.enum(["all", "active", "suspended"]).default("all"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(50),
})

const inviteSchema = z.object({
  email: z.string().email().toLowerCase().max(160),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  role: z.enum([
    "SCHOOL_ADMIN",
    "PRINCIPAL",
    "TEACHER",
    "BURSAR",
    "COUNSELOR",
    "LIBRARIAN",
    "HOSTEL_MASTER",
    "DRIVER",
    "PARENT",
  ]),
  phone: z.string().trim().max(20).optional(),
})

const VALID_ROLES = new Set([
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "BURSAR",
  "COUNSELOR",
  "STUDENT",
  "PARENT",
  "LIBRARIAN",
  "HOSTEL_MASTER",
  "DRIVER",
])

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!ADMIN_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const parsed = listQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    role: url.searchParams.get("role") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 422 })
  const { q, role, status, page, limit } = parsed.data

  const where: Prisma.UserWhereInput = {
    schoolId: session.user.schoolId,
    deletedAt: null,
  }
  if (role && VALID_ROLES.has(role)) where.role = role as UserRole
  if (status === "active") where.isActive = true
  if (status === "suspended") where.isActive = false
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
    ]
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { firstName: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({
    total,
    page,
    limit,
    items: rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: `${u.firstName} ${u.lastName}`,
      role: u.role,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
  })
}

/**
 * POST /api/users — invite a new user.
 *
 * Pragmatic invite flow: we create the User with a random temporary password,
 * return it in the response, and the admin shares it manually. A future
 * iteration could send the invite via Resend instead of returning the password
 * directly. Audit row captures who invited whom and what role.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!ADMIN_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = inviteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data

  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) {
    return NextResponse.json(
      { error: "A user with that email already exists." },
      { status: 409 },
    )
  }

  const tempPassword = randomBytes(8).toString("base64url").slice(0, 12)
  const passwordHash = await bcrypt.hash(tempPassword, 12)

  const created = await prisma.user.create({
    data: {
      schoolId: session.user.schoolId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role as UserRole,
      phone: data.phone ?? null,
      passwordHash,
      isActive: true,
    },
    select: { id: true, email: true, role: true },
  })

  await logAudit({
    schoolId: session.user.schoolId,
    userId: session.user.id,
    action: "user.invite",
    entityType: "User",
    entityId: created.id,
    after: { email: created.email, role: created.role },
  })

  // Return the temporary password to the admin. Not best practice for prod
  // (should email it), but unblocks the workflow without an email pipeline.
  return NextResponse.json({ ok: true, id: created.id, tempPassword }, { status: 201 })
}
