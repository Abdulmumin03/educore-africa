import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { resolveStudentAccess, canWriteStudents } from "@/lib/student-access"
import { sendSms } from "@/lib/sms"

export const runtime = "nodejs"

const schema = z.object({
  studentIds: z.array(z.string()).min(1).max(500),
  message: z.string().trim().min(2).max(280),
  audience: z.enum(["guardians", "students"]).default("guardians"),
})

export async function POST(req: Request) {
  const access = await resolveStudentAccess()
  if (!access.ok) return access.response
  if (!canWriteStudents(access.session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })

  const students = await prisma.student.findMany({
    where: {
      id: { in: parsed.data.studentIds },
      schoolId: access.session.schoolId,
      deletedAt: null,
    },
    include: {
      user: { select: { phone: true } },
      parents: {
        include: { parent: { include: { user: { select: { phone: true } } } } },
      },
    },
  })

  const phones = new Set<string>()
  for (const s of students) {
    if (parsed.data.audience === "students") {
      if (s.user.phone) phones.add(s.user.phone)
    } else {
      const primary = s.parents.find((p) => p.isPrimary) ?? s.parents[0]
      if (primary?.parent.user.phone) phones.add(primary.parent.user.phone)
    }
  }

  if (phones.size === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: students.length })
  }

  // Send sequentially to keep the SDK happy; in production, batch via a queue.
  let sent = 0
  for (const phone of Array.from(phones)) {
    const r = await sendSms(phone, parsed.data.message)
    if (r.ok) sent++
  }

  return NextResponse.json({ ok: true, sent, recipients: phones.size, students: students.length })
}
