import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const bodySchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.string()).min(1).max(100) }),
])

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 422 })

  const where =
    "all" in parsed.data
      ? { userId: session.user.id, readAt: null }
      : { userId: session.user.id, id: { in: parsed.data.ids } }

  const result = await prisma.notification.updateMany({
    where,
    data: { readAt: new Date() },
  })

  return NextResponse.json({ ok: true, updated: result.count })
}
