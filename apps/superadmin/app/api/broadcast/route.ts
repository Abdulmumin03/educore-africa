import { NextResponse } from "next/server"
import type { BroadcastAudience, NotificationChannel } from "@prisma/client"

import { auditLog, auditTarget } from "@/lib/audit"
import { listBroadcasts, sendBroadcast, type AudienceFilter } from "@/lib/broadcast"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const AUDIENCES = ["ALL", "BY_PLAN", "BY_STATE", "BY_STATUS", "CUSTOM"]
const CHANNELS = ["IN_APP", "SMS", "EMAIL", "WHATSAPP", "PUSH"]

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response
  return NextResponse.json({ broadcasts: await listBroadcasts() })
}

/**
 * Send a platform broadcast.
 *
 * BUSINESS_ADMIN or SUPER_ADMIN: this reaches every school administrator on
 * the platform at once, so it is not an ordinary support action.
 */
export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const title = typeof body.title === "string" ? body.title.trim() : ""
  const text = typeof body.body === "string" ? body.body.trim() : ""
  const audience =
    typeof body.audience === "string" && AUDIENCES.includes(body.audience)
      ? (body.audience as BroadcastAudience)
      : null
  const channels = Array.isArray(body.channels)
    ? (body.channels.filter(
        (channel): channel is NotificationChannel =>
          typeof channel === "string" && CHANNELS.includes(channel),
      ) as NotificationChannel[])
    : []
  const filter = (body.filter ?? {}) as AudienceFilter

  if (!title || !text) return NextResponse.json({ error: "A title and body are required." }, { status: 400 })
  if (!audience) return NextResponse.json({ error: "Pick an audience." }, { status: 400 })
  if (channels.length === 0) return NextResponse.json({ error: "Pick at least one channel." }, { status: 400 })

  // A targeted audience with nothing selected would silently fall through to
  // "no schools" and look like a successful send.
  const needsFilter: Record<string, keyof AudienceFilter> = {
    BY_PLAN: "plans",
    BY_STATE: "states",
    BY_STATUS: "statuses",
    CUSTOM: "schoolIds",
  }
  const required = needsFilter[audience]
  if (required && (filter[required]?.length ?? 0) === 0) {
    return NextResponse.json({ error: `Select at least one value for ${audience}.` }, { status: 400 })
  }

  const result = await sendBroadcast({
    title,
    body: text,
    audience,
    filter,
    channels,
    createdById: guard.user.id,
  })

  await auditLog({
    userId: guard.user.id,
    action: "broadcast.send",
    target: auditTarget("system", result.broadcastId),
    targetType: "system",
    ipAddress: guard.ipAddress,
    details: {
      title,
      audience,
      channels,
      schools: result.schools,
      recipients: result.recipients,
      inAppSent: result.inAppSent,
      deferred: result.deferred.map((entry) => entry.channel),
    },
  })

  return NextResponse.json(result, { status: 201 })
}
