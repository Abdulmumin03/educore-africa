import { NextResponse } from "next/server"
import { z } from "zod"
import dayjs from "dayjs"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { HOSTEL_WRITE_ROLES, generateOtp } from "@/lib/hostel-helpers"
import { sendSms } from "@/lib/sms"
import { logAudit } from "@/lib/audit"

export const runtime = "nodejs"

const approveSchema = z.object({ action: z.literal("approve") })
const rejectSchema = z.object({
  action: z.literal("reject"),
  reason: z.string().min(2).max(500),
})
const pickupSchema = z.object({
  action: z.literal("pickup"),
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
})
const returnSchema = z.object({ action: z.literal("return") })

const bodySchema = z.discriminatedUnion("action", [
  approveSchema,
  rejectSchema,
  pickupSchema,
  returnSchema,
])

async function notifyPrimaryParent(
  studentId: string,
  message: string,
): Promise<void> {
  // Look up the student's primary parent's phone — fall back to first linked.
  const link = await prisma.studentParent.findFirst({
    where: { studentId },
    orderBy: { isPrimary: "desc" },
    select: { parent: { select: { user: { select: { phone: true } } } } },
  })
  const phone = link?.parent.user.phone
  if (!phone) {
    console.warn("[exeat] no parent phone to notify", studentId)
    return
  }
  // Fire-and-forget — exeat workflow shouldn't fail because SMS fails.
  await sendSms(phone, message).catch((err) => {
    console.error("[exeat] sms failed", err)
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const exeat = await prisma.exeat.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    include: {
      student: {
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  })
  if (!exeat) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const body = parsed.data
  const studentName = `${exeat.student.user.firstName} ${exeat.student.user.lastName}`

  // Action gating + state machine.
  switch (body.action) {
    case "approve":
    case "reject": {
      if (!HOSTEL_WRITE_ROLES.includes(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      if (exeat.status !== "PENDING") {
        return NextResponse.json(
          { error: `Can't ${body.action} — already ${exeat.status.toLowerCase()}.` },
          { status: 409 },
        )
      }
      const staff = await prisma.staff.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      })
      if (body.action === "approve") {
        const otp = generateOtp()
        await prisma.exeat.update({
          where: { id: exeat.id },
          data: {
            status: "APPROVED",
            approvedById: staff?.id ?? null,
            approvedAt: new Date(),
            pickupOtp: otp,
          },
        })
        await logAudit({
          schoolId: session.user.schoolId,
          userId: session.user.id,
          action: "exeat.approve",
          entityType: "Exeat",
          entityId: exeat.id,
          before: { status: "PENDING" },
          after: { status: "APPROVED", approvedAt: new Date().toISOString() },
          metadata: { studentId: exeat.studentId },
        })
        await notifyPrimaryParent(
          exeat.studentId,
          `${studentName}'s exeat for ${dayjs(exeat.departureDate).format("D MMM")} to ${dayjs(exeat.returnDate).format("D MMM")} is approved. Pickup OTP: ${otp}. Show this OTP at the gate.`,
        )
        return NextResponse.json({ ok: true, status: "APPROVED" })
      }
      // reject
      const rejectionReason = (body as z.infer<typeof rejectSchema>).reason
      await prisma.exeat.update({
        where: { id: exeat.id },
        data: {
          status: "REJECTED",
          approvedById: staff?.id ?? null,
          approvedAt: new Date(),
          rejectionReason,
        },
      })
      await logAudit({
        schoolId: session.user.schoolId,
        userId: session.user.id,
        action: "exeat.reject",
        entityType: "Exeat",
        entityId: exeat.id,
        before: { status: "PENDING" },
        after: { status: "REJECTED", rejectionReason },
        metadata: { studentId: exeat.studentId },
      })
      await notifyPrimaryParent(
        exeat.studentId,
        `${studentName}'s exeat request was declined. Reason: ${rejectionReason}`,
      )
      return NextResponse.json({ ok: true, status: "REJECTED" })
    }

    case "pickup": {
      // Parents present the OTP at the gate; gate staff confirms here.
      if (
        !HOSTEL_WRITE_ROLES.includes(session.user.role) &&
        session.user.role !== "PARENT"
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      if (exeat.status !== "APPROVED") {
        return NextResponse.json(
          { error: `Can't pick up — exeat is ${exeat.status.toLowerCase()}.` },
          { status: 409 },
        )
      }
      if (!exeat.pickupOtp || exeat.pickupOtp !== body.otp) {
        return NextResponse.json({ error: "OTP didn't match." }, { status: 422 })
      }
      await prisma.exeat.update({
        where: { id: exeat.id },
        data: {
          status: "PICKED_UP",
          pickupConfirmedAt: new Date(),
          pickupOtp: null,
        },
      })
      await logAudit({
        schoolId: session.user.schoolId,
        userId: session.user.id,
        action: "exeat.pickup",
        entityType: "Exeat",
        entityId: exeat.id,
        before: { status: "APPROVED" },
        after: { status: "PICKED_UP" },
        metadata: { studentId: exeat.studentId },
      })
      await notifyPrimaryParent(
        exeat.studentId,
        `${studentName} has been picked up from school at ${dayjs().format("HH:mm")} for exeat. Safe trip.`,
      )
      return NextResponse.json({ ok: true, status: "PICKED_UP" })
    }

    case "return": {
      if (!HOSTEL_WRITE_ROLES.includes(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      if (exeat.status !== "PICKED_UP") {
        return NextResponse.json(
          { error: `Can't mark returned — exeat is ${exeat.status.toLowerCase()}.` },
          { status: 409 },
        )
      }
      await prisma.exeat.update({
        where: { id: exeat.id },
        data: { status: "RETURNED", returnConfirmedAt: new Date() },
      })
      await logAudit({
        schoolId: session.user.schoolId,
        userId: session.user.id,
        action: "exeat.return",
        entityType: "Exeat",
        entityId: exeat.id,
        before: { status: "PICKED_UP" },
        after: { status: "RETURNED" },
        metadata: { studentId: exeat.studentId },
      })
      await notifyPrimaryParent(
        exeat.studentId,
        `${studentName} has returned to school at ${dayjs().format("HH:mm")}. Thank you.`,
      )
      return NextResponse.json({ ok: true, status: "RETURNED" })
    }
  }
}
