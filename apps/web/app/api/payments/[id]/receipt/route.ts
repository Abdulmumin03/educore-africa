import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { renderReceiptPdf } from "@/lib/receipt-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STAFF_PRIVILEGED = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BURSAR", "PRINCIPAL"]

/**
 * Streams a receipt PDF for a single payment. Bursar/admin/principal can pull
 * any receipt; parents and students can only fetch receipts for invoices that
 * belong to them.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return new Response("Unauthorized", { status: 401 })
  if (!session.user.schoolId) return new Response("No school context", { status: 400 })

  const payment = await prisma.payment.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    include: {
      invoice: {
        include: {
          student: {
            include: {
              user: { select: { firstName: true, lastName: true, id: true } },
              enrollments: {
                where: { isActive: true, deletedAt: null },
                take: 1,
                include: { class: { select: { name: true } }, section: { select: { name: true } } },
              },
              parents: {
                include: { parent: { include: { user: { select: { id: true } } } } },
              },
            },
          },
          term: { include: { academicYear: { select: { name: true } } } },
          school: {
            select: { name: true, address: true, phone: true, email: true, motto: true },
          },
        },
      },
    },
  })
  if (!payment) return new Response("Not found", { status: 404 })

  const role = session.user.role
  const isPrivileged = STAFF_PRIVILEGED.includes(role)
  const isLinkedParent =
    role === "PARENT" &&
    payment.invoice.student.parents.some((p) => p.parent.user.id === session.user.id)
  const isStudentSelf =
    role === "STUDENT" && payment.invoice.student.user.id === session.user.id
  if (!isPrivileged && !isLinkedParent && !isStudentSelf) {
    return new Response("Forbidden", { status: 403 })
  }

  const enr = payment.invoice.student.enrollments[0]
  const balanceAfter = Math.max(
    0,
    Number(payment.invoice.amountDue) - Number(payment.invoice.amountPaid),
  )

  const pdf = await renderReceiptPdf({
    school: payment.invoice.school,
    student: {
      name: `${payment.invoice.student.user.firstName} ${payment.invoice.student.user.lastName}`,
      admissionNumber: payment.invoice.student.admissionNumber,
      className: enr?.class.name ?? null,
      sectionName: enr?.section.name ?? null,
    },
    invoice: {
      no: payment.invoice.invoiceNo,
      termLabel: `${payment.invoice.term.academicYear.name} ${payment.invoice.term.type[0] + payment.invoice.term.type.slice(1).toLowerCase()} term`,
      amountDue: Number(payment.invoice.amountDue),
      amountPaid: Number(payment.invoice.amountPaid),
      balanceAfter,
    },
    payment: {
      reference: payment.reference,
      amount: Number(payment.amount),
      channel: payment.channel,
      paidAt: payment.paidAt.toISOString(),
      payerName: payment.payerName,
      payerPhone: payment.payerPhone,
      notes: payment.notes,
    },
  })

  const filename = `receipt-${payment.invoice.invoiceNo}-${payment.reference}.pdf`
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}
