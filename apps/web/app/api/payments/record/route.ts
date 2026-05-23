import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { resolveFinanceAccess } from "@/lib/finance-access"
import { recordPaymentSchema } from "@/lib/finance-schemas"
import { refreshInvoiceTotals } from "@/lib/finance"
import { sendSms } from "@/lib/sms"

export const runtime = "nodejs"

/**
 * Manual payment recording — cash, bank transfer, POS, cheque, USSD, mobile
 * money. Caller (bursar/admin) enters everything; we generate a reference if
 * none provided.
 */
export async function POST(req: Request) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = recordPaymentSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data

  const invoice = await prisma.feeInvoice.findFirst({
    where: { id: data.invoiceId, schoolId: access.session.schoolId, deletedAt: null },
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
      school: { select: { id: true, name: true } },
    },
  })
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const balance = Math.max(0, Number(invoice.amountDue) - Number(invoice.amountPaid))
  if (data.amount > balance) {
    return NextResponse.json(
      { error: `Amount exceeds outstanding balance (NGN ${balance.toLocaleString()})` },
      { status: 422 },
    )
  }

  const reference =
    data.reference ||
    `MAN-${invoice.invoiceNo}-${Date.now().toString(36)}`

  let paymentId: string
  try {
    const created = await prisma.payment.create({
      data: {
        schoolId: access.session.schoolId,
        invoiceId: invoice.id,
        reference,
        amount: new Prisma.Decimal(data.amount),
        channel: data.channel,
        paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
        payerName: data.payerName || null,
        payerPhone: data.payerPhone || null,
        notes: data.notes || null,
        evidenceUrl: data.evidenceUrl || null,
        recordedById: access.session.userId,
      },
      select: { id: true },
    })
    paymentId = created.id
  } catch (err) {
    if (err instanceof Error && /Unique constraint/i.test(err.message)) {
      return NextResponse.json({ error: "Reference already used" }, { status: 409 })
    }
    throw err
  }

  await refreshInvoiceTotals(invoice.id)

  // Receipt SMS.
  const primary = invoice.student.parents[0]?.parent
  if (primary?.user.phone) {
    const studentName = `${invoice.student.user.firstName} ${invoice.student.user.lastName}`
    const message =
      `${invoice.school.name}: payment received. NGN ${data.amount.toLocaleString()} ` +
      `for ${studentName} (invoice ${invoice.invoiceNo}, ${data.channel.replace("_", " ")}). ` +
      `Ref ${reference}. Thank you.`
    void sendSms(primary.user.phone, message)
    await prisma.notification.create({
      data: {
        schoolId: access.session.schoolId,
        userId: primary.user.id,
        channel: "SMS",
        title: "Payment received",
        body: message,
        metadata: { invoiceId: invoice.id, paymentRef: reference },
        sentAt: new Date(),
      },
    })
  }

  return NextResponse.json({ ok: true, reference, paymentId })
}
