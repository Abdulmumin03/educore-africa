import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { HOSTEL_ADMIN_ROLES, HOSTEL_WRITE_ROLES } from "@/lib/hostel-helpers"

export const runtime = "nodejs"

const patchSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "DECLINED"]),
})

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  // Houseparents can move OPEN → IN_PROGRESS; only admins can RESOLVE or DECLINE.
  if (!HOSTEL_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const m = await prisma.maintenanceRequest.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true, status: true },
  })
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 422 })
  }
  const nextStatus = parsed.data.status

  if (
    (nextStatus === "RESOLVED" || nextStatus === "DECLINED") &&
    !HOSTEL_ADMIN_ROLES.includes(session.user.role)
  ) {
    return NextResponse.json(
      { error: "Only school admins can resolve or decline requests." },
      { status: 403 },
    )
  }

  const staff = await prisma.staff.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  await prisma.maintenanceRequest.update({
    where: { id: m.id },
    data: {
      status: nextStatus,
      resolvedById:
        (nextStatus === "RESOLVED" || nextStatus === "DECLINED") && staff
          ? staff.id
          : undefined,
      resolvedAt:
        nextStatus === "RESOLVED" || nextStatus === "DECLINED" ? new Date() : null,
    },
  })
  return NextResponse.json({ ok: true })
}
