import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/audit"

export const runtime = "nodejs"

const bodySchema = z.object({
  title: z.string().trim().min(2).max(140),
  body: z.string().trim().min(2).max(4000),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).default("NORMAL"),
})

/**
 * POST /api/network/broadcast — fan out an Announcement to every school.
 *
 * SUPER_ADMIN only. Each school gets its own Announcement row with the
 * super-admin as the author. Channel dispatch (SMS/email) is intentionally
 * NOT triggered here — schools enable channels via their announcement
 * composer. This endpoint only seeds the rows.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { title, body, priority } = parsed.data

  const schools = await prisma.school.findMany({
    where: { deletedAt: null },
    select: { id: true },
  })
  if (schools.length === 0) {
    return NextResponse.json({ ok: true, created: 0 })
  }

  const data: Prisma.AnnouncementCreateManyInput[] = schools.map((s) => ({
    schoolId: s.id,
    authorId: session.user.id,
    title,
    body,
    audience: "ALL",
    priority,
    channels: [], // empty = legacy "use user prefs"
    publishedAt: new Date(),
  }))

  const result = await prisma.announcement.createMany({ data })

  await logAudit({
    schoolId: null,
    userId: session.user.id,
    action: "network.broadcast",
    entityType: "Announcement",
    metadata: {
      schoolCount: schools.length,
      created: result.count,
      title,
      priority,
    },
  })

  return NextResponse.json({ ok: true, created: result.count })
}
