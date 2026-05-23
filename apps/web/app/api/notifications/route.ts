import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 50)
  const unreadOnly = url.searchParams.get("unreadOnly") === "true"

  const where = {
    userId: session.user.id,
    deletedAt: null,
    ...(unreadOnly ? { readAt: null } : {}),
  }

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        channel: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
        metadata: true,
      },
    }),
    prisma.notification.count({
      where: { userId: session.user.id, readAt: null, deletedAt: null },
    }),
  ])

  return NextResponse.json({ unreadCount, items })
}
