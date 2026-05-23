import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { resolveAttendanceAccess } from "@/lib/attendance-access"
import { sendSms } from "@/lib/sms"

export const runtime = "nodejs"

const inputSchema = z.object({
  studentId: z.string().cuid(),
  message: z.string().trim().min(2).max(280).optional().or(z.literal("")),
})

/**
 * Send an SMS to the primary guardian about a student's attendance. Used by
 * the AI risk widget's "Contact Parent" button.
 */
export async function POST(req: Request) {
  const access = await resolveAttendanceAccess()
  if (!access.ok) return access.response

  const parsed = inputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 })

  const student = await prisma.student.findFirst({
    where: {
      id: parsed.data.studentId,
      schoolId: access.session.schoolId,
      deletedAt: null,
    },
    include: {
      user: { select: { firstName: true, lastName: true } },
      school: { select: { name: true } },
      parents: {
        where: { isPrimary: true },
        include: { parent: { include: { user: { select: { phone: true, id: true } } } } },
      },
    },
  })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const primary = student.parents[0]?.parent
  if (!primary?.user.phone) {
    return NextResponse.json({ error: "No primary guardian phone on file" }, { status: 409 })
  }

  const defaultMessage =
    `Hello, this is ${student.school.name}. We'd like to discuss ${student.user.firstName} ${student.user.lastName}'s ` +
    `recent attendance. Please call us at your earliest convenience.`
  const message = parsed.data.message || defaultMessage

  const result = await sendSms(primary.user.phone, message)
  await prisma.notification.create({
    data: {
      schoolId: access.session.schoolId,
      userId: primary.user.id,
      channel: "SMS",
      title: "Attendance follow-up",
      body: message,
      metadata: { studentId: student.id, initiatedBy: access.session.userId },
      sentAt: new Date(),
    },
  })

  return NextResponse.json({ ok: result.ok, sent: result.ok })
}
