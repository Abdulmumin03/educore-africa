import { NextResponse } from "next/server"
import type { DataRequestStatus, DataRequestType } from "@prisma/client"

import { auditLog, auditTarget } from "@/lib/audit"
import { NDPR_RESPONSE_DAYS, dueDateFor, listRequests } from "@/lib/compliance"
import { prisma } from "@/lib/db"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const TYPES = ["ACCESS", "DELETION", "PORTABILITY"]
const STATUSES = ["RECEIVED", "IN_PROGRESS", "COMPLETED", "DENIED"]

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "ENGINEERING_ADMIN", "SUPPORT_ADMIN")
  if (forbidden) return forbidden

  const status = new URL(request.url).searchParams.get("status")
  const result = await listRequests({
    status: status && STATUSES.includes(status) ? (status as DataRequestStatus) : undefined,
  })

  return NextResponse.json({ ...result, responseDays: NDPR_RESPONSE_DAYS })
}

export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "ENGINEERING_ADMIN", "SUPPORT_ADMIN")
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const type =
    typeof body.type === "string" && TYPES.includes(body.type) ? (body.type as DataRequestType) : null
  const subjectName = typeof body.subjectName === "string" ? body.subjectName.trim() : ""
  const subjectEmail = typeof body.subjectEmail === "string" ? body.subjectEmail.trim().toLowerCase() : ""

  if (!type) return NextResponse.json({ error: "Pick a request type." }, { status: 400 })
  if (!subjectName || !subjectEmail) {
    return NextResponse.json({ error: "The subject's name and email are required." }, { status: 400 })
  }

  const schoolId = typeof body.schoolId === "string" && body.schoolId ? body.schoolId : null
  if (schoolId) {
    const school = await prisma.school.findFirst({ where: { id: schoolId }, select: { id: true } })
    if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 })
  }

  // Try to resolve the subject to a real account now, while the email is in
  // hand — a DELETION cannot be executed later without one.
  const matched = await prisma.user.findUnique({
    where: { email: subjectEmail },
    select: { id: true, schoolId: true },
  })

  // The clock starts when the request was RECEIVED, which may predate the row.
  const receivedAt =
    typeof body.receivedAt === "string" && body.receivedAt ? new Date(body.receivedAt) : new Date()
  if (Number.isNaN(receivedAt.getTime()) || receivedAt > new Date()) {
    return NextResponse.json({ error: "The received date must be valid and not in the future." }, { status: 400 })
  }

  const created = await prisma.dataSubjectRequest.create({
    data: {
      type,
      subjectName,
      subjectEmail,
      schoolId: schoolId ?? matched?.schoolId ?? null,
      userId: matched?.id ?? null,
      details: typeof body.details === "string" ? body.details.trim() || null : null,
      receivedAt,
      dueAt: dueDateFor(receivedAt),
    },
    select: { id: true, type: true, status: true, dueAt: true, userId: true },
  })

  await auditLog({
    userId: guard.user.id,
    action: "compliance.request.create",
    target: auditTarget("system", `dsr:${created.id}`),
    targetType: "system",
    ipAddress: guard.ipAddress,
    details: { type, subjectEmail, schoolId, matchedUser: Boolean(matched) },
  })

  return NextResponse.json(
    {
      request: { ...created, dueAt: created.dueAt.toISOString() },
      matchedUser: Boolean(matched),
      notice: matched
        ? undefined
        : "No account matches that email. A deletion cannot be executed until the subject is identified.",
    },
    { status: 201 },
  )
}
