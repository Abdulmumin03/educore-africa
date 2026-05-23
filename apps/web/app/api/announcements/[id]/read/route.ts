import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

/**
 * Mark the current announcement as read by the current user. Idempotent.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId) {
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  }

  const announcement = await prisma.announcement.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!announcement) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const row = await prisma.announcementRead.upsert({
    where: {
      announcementId_userId: {
        announcementId: announcement.id,
        userId: session.user.id,
      },
    },
    update: {}, // do not refresh readAt on subsequent calls
    create: {
      announcementId: announcement.id,
      userId: session.user.id,
    },
    select: { readAt: true },
  })

  return NextResponse.json({ ok: true, readAt: row.readAt.toISOString() })
}
