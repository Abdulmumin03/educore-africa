import { NextResponse } from "next/server"
import type { PlatformAnnouncementType, SchoolPlan } from "@prisma/client"

import { listAnnouncements } from "@/lib/announcements"
import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const TYPES = ["INFO", "WARNING", "MAINTENANCE"]
const PLANS = ["STARTER", "GROWTH", "PROFESSIONAL", "ENTERPRISE", "GOVERNMENT"]

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response
  return NextResponse.json({ announcements: await listAnnouncements() })
}

export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "BUSINESS_ADMIN", "ENGINEERING_ADMIN")
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const title = typeof body.title === "string" ? body.title.trim() : ""
  const text = typeof body.body === "string" ? body.body.trim() : ""
  const type =
    typeof body.type === "string" && TYPES.includes(body.type)
      ? (body.type as PlatformAnnouncementType)
      : "INFO"
  const startsAt = typeof body.startsAt === "string" && body.startsAt ? new Date(body.startsAt) : new Date()
  const endsAt = typeof body.endsAt === "string" && body.endsAt ? new Date(body.endsAt) : null
  const targetPlans = Array.isArray(body.targetPlans)
    ? (body.targetPlans.filter(
        (value): value is SchoolPlan => typeof value === "string" && PLANS.includes(value),
      ) as SchoolPlan[])
    : []

  if (!title || !text) {
    return NextResponse.json({ error: "A title and body are required." }, { status: 400 })
  }
  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "The start date is not valid." }, { status: 400 })
  }
  if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)) {
    return NextResponse.json({ error: "The end date must be after the start date." }, { status: 400 })
  }
  // A maintenance banner with no end date stays on every dashboard forever.
  if (type === "MAINTENANCE" && !endsAt) {
    return NextResponse.json(
      { error: "A maintenance notice needs an end date — it would otherwise never come down." },
      { status: 400 },
    )
  }

  const announcement = await prisma.platformAnnouncement.create({
    data: {
      title,
      body: text,
      type,
      startsAt,
      endsAt,
      targetPlans,
      dismissible: body.dismissible !== false,
      createdById: guard.user.id,
    },
    select: { id: true, title: true, type: true, startsAt: true, endsAt: true },
  })

  await auditLog({
    userId: guard.user.id,
    action: "config.announcement.create",
    target: auditTarget("config", `announcement:${announcement.id}`),
    targetType: "config",
    ipAddress: guard.ipAddress,
    details: { title, type, targetPlans, startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() ?? null },
  })

  return NextResponse.json({ announcement }, { status: 201 })
}
