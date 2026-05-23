import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { sendSms } from "@/lib/sms"
import { verifyWebhookSignature } from "@/lib/paystack"
import { refreshInvoiceTotals } from "@/lib/finance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Paystack webhook. Verifies HMAC, handles `charge.success` (and ignores the
 * rest). Idempotent — looks up the existing Payment by Paystack reference
 * before inserting a new one.
 *
 * Set the URL in your Paystack dashboard to:
 *   https://<your-host>/api/webhooks/paystack
 */
export async function POST(req: Request) {
  const rawBody = await req.text()
  const signature = req.headers.get("x-paystack-signature")
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let event: {
    event: string
    data: {
      reference: string
      amount: number // kobo
      status: string
      channel: string
      paid_at?: string
      paidAt?: string
      customer?: { email?: string; first_name?: string; last_name?: string; phone?: string }
      metadata?: Record<string, unknown> | string
    }
  }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (event.event !== "charge.success") {
    // Acknowledge other events but do nothing. Paystack expects a 2xx.
    return NextResponse.json({ ok: true, ignored: event.event })
  }

  const reference = event.data.reference
  const existing = await prisma.payment.findUnique({ where: { reference } })
  if (existing) {
    // Duplicate webhook fire — already processed.
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // Resolve the invoice via Paystack metadata (we set invoiceId on init).
  const meta =
    typeof event.data.metadata === "string"
      ? (JSON.parse(event.data.metadata) as Record<string, unknown>)
      : event.data.metadata ?? {}
  const invoiceId = typeof meta.invoiceId === "string" ? meta.invoiceId : null
  if (!invoiceId) {
    return NextResponse.json({ error: "metadata.invoiceId missing" }, { status: 422 })
  }
  const invoice = await prisma.feeInvoice.findUnique({
    where: { id: invoiceId },
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
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  }

  const amountNgn = event.data.amount / 100
  const paidAt = new Date(event.data.paid_at ?? event.data.paidAt ?? new Date())

  await prisma.payment.create({
    data: {
      schoolId: invoice.school.id,
      invoiceId: invoice.id,
      reference,
      providerRef: reference,
      amount: new Prisma.Decimal(amountNgn),
      channel: "PAYSTACK",
      paidAt,
      payerName:
        event.data.customer?.first_name || event.data.customer?.last_name
          ? `${event.data.customer?.first_name ?? ""} ${event.data.customer?.last_name ?? ""}`.trim()
          : null,
      payerPhone: event.data.customer?.phone ?? null,
      rawPayload: event as unknown as Prisma.InputJsonValue,
    },
  })

  await refreshInvoiceTotals(invoice.id)

  // Receipt SMS to primary guardian.
  const primary = invoice.student.parents[0]?.parent
  if (primary?.user.phone) {
    const studentName = `${invoice.student.user.firstName} ${invoice.student.user.lastName}`
    const message =
      `${invoice.school.name}: payment received. NGN ${amountNgn.toLocaleString()} ` +
      `for ${studentName} (invoice ${invoice.invoiceNo}). Ref ${reference}. Thank you.`
    void sendSms(primary.user.phone, message)
    await prisma.notification.create({
      data: {
        schoolId: invoice.school.id,
        userId: primary.user.id,
        channel: "SMS",
        title: "Payment received",
        body: message,
        metadata: { invoiceId: invoice.id, paymentRef: reference },
        sentAt: new Date(),
      },
    })
  }

  return NextResponse.json({ ok: true })
}
