import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/db"
import { resolveGradeAccess } from "@/lib/grade-access"
import { sendSms } from "@/lib/sms"
import { shareMidtermReportSchema } from "@/lib/grade-schemas"

export const runtime = "nodejs"

function makeToken(): string {
  return randomBytes(24).toString("base64url")
}

/**
 * POST /api/grades/midterm-reports/share
 *
 * Body: { studentId, termId, expiresInDays?, sendSms? }
 *
 * Mints a public URL token for a midterm report. Upserts the MidtermReport
 * row if it doesn't exist yet (so the share works even before "Initialise"
 * has been clicked). Optionally SMS's the primary guardian.
 */
export async function POST(req: Request) {
  const access = await resolveGradeAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = shareMidtermReportSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { studentId, termId, expiresInDays, sendSms: shouldSms } = parsed.data
  const schoolId = access.session.schoolId

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId, deletedAt: null },
    include: {
      user: { select: { firstName: true, lastName: true } },
      parents: {
        where: { isPrimary: true },
        include: { parent: { include: { user: { select: { id: true, phone: true } } } } },
      },
    },
  })
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 })

  const term = await prisma.term.findFirst({
    where: { id: termId, academicYear: { schoolId } },
    include: { academicYear: { select: { name: true } } },
  })
  if (!term) return NextResponse.json({ error: "Term not found" }, { status: 404 })

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { name: true },
  })

  // Upsert the row so the share is always anchored to a real MidtermReport.id.
  const midterm = await prisma.midtermReport.upsert({
    where: { studentId_termId: { studentId, termId } },
    create: {
      schoolId,
      studentId,
      termId,
      generatedById: access.session.userId,
    },
    update: {},
  })

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expiresInDays)

  const share = await prisma.midtermReportShare.create({
    data: {
      midtermReportId: midterm.id,
      token: makeToken(),
      expiresAt,
      createdById: access.session.userId,
    },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const url = `${appUrl}/midterm-reports/${share.token}`

  let smsResult: { ok: boolean; error?: string } | null = null
  if (shouldSms) {
    const primary = student.parents[0]?.parent
    if (primary?.user.phone) {
      const studentName = `${student.user.firstName} ${student.user.lastName}`
      const termLabel = `${term.academicYear.name} ${term.type.toLowerCase()}-term`
      const message =
        `${school?.name ?? "Your school"}: ${studentName}'s ${termLabel} midterm ` +
        `report is ready. Download (valid ${expiresInDays} days): ${url}`
      const result = await sendSms(primary.user.phone, message)
      smsResult = result.ok ? { ok: true } : { ok: false, error: result.error }
      await prisma.midtermReportShare.update({
        where: { id: share.id },
        data: { smsSentAt: result.ok ? new Date() : null },
      })
      if (result.ok) {
        await prisma.notification.create({
          data: {
            schoolId,
            userId: primary.user.id,
            channel: "SMS",
            title: "Midterm report ready",
            body: message,
            metadata: { midtermReportId: midterm.id, shareToken: share.token },
            sentAt: new Date(),
          },
        })
      }
    } else {
      smsResult = { ok: false, error: "No primary guardian phone on file" }
    }
  }

  return NextResponse.json({
    ok: true,
    token: share.token,
    url,
    expiresAt: share.expiresAt.toISOString(),
    sms: smsResult,
  })
}
