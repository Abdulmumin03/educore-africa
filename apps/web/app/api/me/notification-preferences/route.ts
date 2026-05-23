import { NextResponse } from "next/server"
import { z } from "zod"
import type { NotificationChannel } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const CHANNELS: NotificationChannel[] = ["EMAIL", "SMS", "WHATSAPP", "PUSH", "IN_APP"]

// Defaults if a user has no row for a given channel.
const DEFAULTS: Record<NotificationChannel, boolean> = {
  EMAIL: true,
  SMS: true,
  WHATSAPP: false,
  PUSH: true,
  IN_APP: true,
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rows = await prisma.userNotificationPreference.findMany({
    where: { userId: session.user.id },
    select: { channel: true, enabled: true },
  })
  const map = new Map(rows.map((r) => [r.channel, r.enabled]))

  return NextResponse.json({
    preferences: CHANNELS.map((channel) => ({
      channel,
      enabled: map.get(channel) ?? DEFAULTS[channel],
    })),
  })
}

const putSchema = z.object({
  preferences: z
    .array(
      z.object({
        channel: z.enum(["EMAIL", "SMS", "WHATSAPP", "PUSH", "IN_APP"]),
        enabled: z.boolean(),
      }),
    )
    .min(1),
})

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = putSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 422 })
  }

  await prisma.$transaction(
    parsed.data.preferences.map((p) =>
      prisma.userNotificationPreference.upsert({
        where: { userId_channel: { userId: session.user.id, channel: p.channel } },
        update: { enabled: p.enabled },
        create: { userId: session.user.id, channel: p.channel, enabled: p.enabled },
      }),
    ),
  )

  return NextResponse.json({ ok: true })
}
