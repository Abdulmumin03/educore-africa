import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveFinanceAccess } from "@/lib/finance-access"
import { remindDebtorsSchema } from "@/lib/finance-schemas"
import { sendSms } from "@/lib/sms"
import { sendEmail } from "@/lib/email"

export const runtime = "nodejs"

/**
 * Bulk reminder to primary guardians of the given invoices. Sends SMS via
 * Africa's Talking + email via Resend. Returns per-channel counts.
 */
export async function POST(req: Request) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = remindDebtorsSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { invoiceIds, channels, message } = parsed.data

  const invoices = await prisma.feeInvoice.findMany({
    where: {
      id: { in: invoiceIds },
      schoolId: access.session.schoolId,
      deletedAt: null,
    },
    include: {
      student: {
        include: {
          user: { select: { firstName: true, lastName: true } },
          parents: {
            where: { isPrimary: true },
            include: {
              parent: { include: { user: { select: { phone: true, email: true, id: true } } } },
            },
          },
        },
      },
      school: { select: { name: true } },
      term: { include: { academicYear: { select: { name: true } } } },
    },
  })

  let smsSent = 0
  let emailSent = 0
  const errors: Array<{ invoiceId: string; reason: string }> = []

  for (const inv of invoices) {
    const balance = Math.max(0, Number(inv.amountDue) - Number(inv.amountPaid))
    if (balance <= 0) {
      errors.push({ invoiceId: inv.id, reason: "Invoice is settled" })
      continue
    }
    const studentName = `${inv.student.user.firstName} ${inv.student.user.lastName}`
    const dueLabel = inv.dueDate.toISOString().slice(0, 10)
    const body =
      message ||
      `${inv.school.name}: outstanding fees of NGN ${balance.toLocaleString()} for ${studentName} ` +
        `(invoice ${inv.invoiceNo}, due ${dueLabel}). Please settle to avoid disruption.`
    const primary = inv.student.parents[0]?.parent
    if (!primary) {
      errors.push({ invoiceId: inv.id, reason: "No primary guardian" })
      continue
    }

    if (channels.includes("SMS") && primary.user.phone) {
      const r = await sendSms(primary.user.phone, body)
      if (r.ok) {
        smsSent += 1
        await prisma.notification.create({
          data: {
            schoolId: access.session.schoolId,
            userId: primary.user.id,
            channel: "SMS",
            title: "Fee reminder",
            body,
            metadata: { invoiceId: inv.id, balance },
            sentAt: new Date(),
          },
        })
      } else {
        errors.push({ invoiceId: inv.id, reason: `SMS: ${r.error}` })
      }
    }
    if (channels.includes("EMAIL") && primary.user.email) {
      const r = await sendEmail({
        to: primary.user.email,
        subject: `Fee reminder — ${inv.invoiceNo}`,
        html: `<p>${body}</p>`,
        text: body,
      })
      if (r.ok) {
        emailSent += 1
        await prisma.notification.create({
          data: {
            schoolId: access.session.schoolId,
            userId: primary.user.id,
            channel: "EMAIL",
            title: "Fee reminder",
            body,
            metadata: { invoiceId: inv.id, balance },
            sentAt: new Date(),
          },
        })
      } else {
        errors.push({ invoiceId: inv.id, reason: `Email: ${r.error}` })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    smsSent,
    emailSent,
    errors,
    targeted: invoices.length,
  })
}
