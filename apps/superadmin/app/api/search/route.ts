import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const LIMIT = 6

// Backs the ⌘K palette. Pages are matched client-side off the nav config —
// only the two things that need the database come from here.
export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) return NextResponse.json({ schools: [], users: [] })

  const [schools, users] = await Promise.all([
    prisma.school.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { name: "asc" },
      take: LIMIT,
      select: { id: true, name: true, slug: true, state: true, isActive: true },
    }),
    prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { email: "asc" },
      take: LIMIT,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        school: { select: { name: true } },
      },
    }),
  ])

  return NextResponse.json({
    schools: schools.map((school) => ({
      id: school.id,
      name: school.name,
      slug: school.slug,
      state: school.state,
      isActive: school.isActive,
    })),
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
      role: user.role,
      schoolName: user.school?.name ?? null,
    })),
  })
}
