import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { initializePaystackSchema } from "@/lib/finance-schemas"
import { initializePaystack } from "@/lib/paystack"

export const runtime = "nodejs"

/**
 * Initialize a Paystack transaction for an invoice.
 *
 * Authorisation: bursar/admin can pay on behalf of anyone; parents may only
 * initialise payment for their linked children; students for themselves.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const parsed = initializePaystackSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { invoiceId, amount, email, callbackUrl } = parsed.data

  const invoice = await prisma.feeInvoice.findFirst({
    where: { id: invoiceId, schoolId: session.user.schoolId, deletedAt: null },
    include: {
      student: {
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          parents: {
            where: { isPrimary: true },
            include: {
              parent: { include: { user: { select: { firstName: true, lastName: true, email: true, phone: true, id: true } } } },
            },
          },
        },
      },
      school: { select: { name: true } },
    },
  })
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (invoice.status === "PAID") {
    return NextResponse.json({ error: "Invoice already paid" }, { status: 409 })
  }

  const role = session.user.role
  const isPrivileged = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BURSAR"].includes(role)
  const isLinkedParent =
    role === "PARENT" &&
    invoice.student.parents.some((p) => p.parent.user.id === session.user.id)
  const isStudentSelf = role === "STUDENT" && invoice.student.userId === session.user.id
  if (!isPrivileged && !isLinkedParent && !isStudentSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const balance = Math.max(0, Number(invoice.amountDue) - Number(invoice.amountPaid))
  if (balance <= 0) {
    return NextResponse.json({ error: "Nothing to pay" }, { status: 409 })
  }
  const payAmount = amount ?? balance
  if (payAmount > balance) {
    return NextResponse.json({ error: "Amount exceeds outstanding balance" }, { status: 422 })
  }

  const payerEmail =
    email ||
    invoice.student.parents[0]?.parent.user.email ||
    invoice.student.user.email
  if (!payerEmail) {
    return NextResponse.json({ error: "No payer email on file" }, { status: 422 })
  }

  // Unique-per-attempt reference. Paystack-side dedupe + our DB-side
  // dedupe in the webhook handler prevent double-counting.
  const reference = `EDC-${invoice.invoiceNo}-${Date.now().toString(36)}`

  const result = await initializePaystack({
    email: payerEmail,
    amount: payAmount,
    reference,
    callbackUrl,
    metadata: {
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      studentId: invoice.student.id,
      schoolId: invoice.schoolId,
      schoolName: invoice.school.name,
    },
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })

  return NextResponse.json({
    ok: true,
    reference: result.data.reference,
    accessCode: result.data.access_code,
    authorizationUrl: result.data.authorization_url,
  })
}
