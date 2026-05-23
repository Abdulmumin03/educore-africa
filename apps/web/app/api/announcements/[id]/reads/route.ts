import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const VIEW_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]

/**
 * Read-receipt summary for staff: count of distinct readers + the most recent
 * 20. Only staff who can see /dashboard/announcements may read this.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId) {
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  }
  if (!VIEW_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const announcement = await prisma.announcement.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!announcement) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const [count, latest] = await Promise.all([
    prisma.announcementRead.count({ where: { announcementId: announcement.id } }),
    prisma.announcementRead.findMany({
      where: { announcementId: announcement.id },
      orderBy: { readAt: "desc" },
      take: 20,
      include: {
        user: { select: { firstName: true, lastName: true, role: true } },
      },
    }),
  ])

  return NextResponse.json({
    count,
    readers: latest.map((r) => ({
      readAt: r.readAt.toISOString(),
      name: `${r.user.firstName} ${r.user.lastName}`,
      role: r.user.role,
    })),
  })
}
