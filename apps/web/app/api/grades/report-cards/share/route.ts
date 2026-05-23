import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/db"
import { resolveGradeAccess } from "@/lib/grade-access"
import { sendSms } from "@/lib/sms"
import { shareReportCardSchema } from "@/lib/grade-schemas"

export const runtime = "nodejs"

function makeToken(): string {
  return randomBytes(24).toString("base64url")
}

/**
 * Create a shareable, time-limited public URL for a ReportCard, optionally
 * SMS'ing it to the primary guardian.
 */
export async function POST(req: Request) {
  const access = await resolveGradeAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = shareReportCardSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { reportCardId, expiresInDays, sendSms: shouldSms } = parsed.data

  const card = await prisma.reportCard.findFirst({
    where: { id: reportCardId, schoolId: access.session.schoolId, deletedAt: null },
    include: {
      student: {
        include: {
          user: { select: { firstName: true, lastName: true } },
          parents: {
            where: { isPrimary: true },
            include: { parent: { include: { user: { select: { phone: true, id: true } } } } },
          },
        },
      },
      term: { include: { academicYear: { select: { name: true } } } },
      school: { select: { name: true } },
    },
  })
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expiresInDays)

  const share = await prisma.reportCardShare.create({
    data: {
      reportCardId: card.id,
      token: makeToken(),
      expiresAt,
      createdById: access.session.userId,
    },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const url = `${appUrl}/report-cards/${share.token}`

  let smsResult: { ok: boolean; error?: string } | null = null
  if (shouldSms) {
    const primary = card.student.parents[0]?.parent
    if (primary?.user.phone) {
      const studentName = `${card.student.user.firstName} ${card.student.user.lastName}`
      const message =
        `${card.school.name}: ${studentName}'s ${card.term.academicYear.name} ` +
        `${card.term.type.toLowerCase()}-term report card is ready. ` +
        `Download (valid ${expiresInDays} days): ${url}`
      const result = await sendSms(primary.user.phone, message)
      smsResult = result.ok ? { ok: true } : { ok: false, error: result.error }
      await prisma.reportCardShare.update({
        where: { id: share.id },
        data: { smsSentAt: result.ok ? new Date() : null },
      })
      if (result.ok) {
        await prisma.notification.create({
          data: {
            schoolId: access.session.schoolId,
            userId: primary.user.id,
            channel: "SMS",
            title: "Report card ready",
            body: message,
            metadata: { reportCardId: card.id, shareToken: share.token },
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
