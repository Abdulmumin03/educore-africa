import { NextResponse } from "next/server"
import type { Prisma, UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const ROLE_OPTIONS: UserRole[] = [
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "BURSAR",
  "COUNSELOR",
  "PARENT",
  "STUDENT",
  "LIBRARIAN",
  "HOSTEL_MASTER",
  "DRIVER",
]

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const url = new URL(req.url)
  const q = (url.searchParams.get("q") ?? "").trim()
  const role = url.searchParams.get("role") as UserRole | null
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") ?? 10)))

  const where: Prisma.UserWhereInput = {
    schoolId: session.user.schoolId,
    isActive: true,
    deletedAt: null,
    id: { not: session.user.id },
    ...(role && ROLE_OPTIONS.includes(role) ? { role } : {}),
    ...(q.length >= 2
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  }

  const users = await prisma.user.findMany({
    where,
    take: limit,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      avatarUrl: true,
      email: true,
    },
  })

  return NextResponse.json({ items: users, roles: ROLE_OPTIONS })
}
