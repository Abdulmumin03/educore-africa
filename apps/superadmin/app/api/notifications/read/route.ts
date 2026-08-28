import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

/** Marks everything currently in the feed as read by moving the watermark. */
export async function PATCH(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const readAt = new Date()
  await prisma.superAdminUser.update({
    where: { id: guard.user.id },
    data: { notificationsReadAt: readAt },
  })

  return NextResponse.json({ ok: true, readAt: readAt.toISOString() })
}
