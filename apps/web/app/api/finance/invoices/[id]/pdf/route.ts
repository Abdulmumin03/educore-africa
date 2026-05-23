import { prisma } from "@/lib/db"
import { resolveFinanceAccess } from "@/lib/finance-access"
import { renderInvoicePdf } from "@/lib/invoice-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response

  const inv = await prisma.feeInvoice.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    include: {
      student: {
        include: {
          user: { select: { firstName: true, lastName: true } },
          enrollments: {
            where: { isActive: true, deletedAt: null },
            take: 1,
            include: { class: { select: { name: true } }, section: { select: { name: true } } },
          },
        },
      },
      term: { include: { academicYear: { select: { name: true } } } },
      payments: { where: { deletedAt: null }, orderBy: { paidAt: "desc" } },
      school: {
        select: { name: true, address: true, phone: true, email: true, logoUrl: true, motto: true, settings: true },
      },
    },
  })
  if (!inv) return new Response("Not found", { status: 404 })

  const enr = inv.student.enrollments[0]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  // Public-friendly payment URL — parent portal handles the actual init.
  const payUrl = `${appUrl}/pay/${inv.id}`

  // Bank details from school.settings.bank (if configured).
  const bank =
    inv.school.settings &&
    typeof inv.school.settings === "object" &&
    "bank" in inv.school.settings &&
    inv.school.settings.bank
      ? (inv.school.settings.bank as { name: string; accountNumber: string; accountName: string })
      : null

  const pdf = await renderInvoicePdf({
    school: { ...inv.school, bank },
    student: {
      name: `${inv.student.user.firstName} ${inv.student.user.lastName}`,
      admissionNumber: inv.student.admissionNumber,
      className: enr?.class.name ?? null,
      sectionName: enr?.section.name ?? null,
    },
    term: { type: inv.term.type, sessionName: inv.term.academicYear.name },
    invoice: {
      no: inv.invoiceNo,
      items: (inv.items ?? []) as { name: string; category: string; amount: number; isMandatory: boolean }[],
      subtotal: Number(inv.subtotal),
      discountAmount: Number(inv.discountAmount),
      discountReason: inv.discountReason,
      amountDue: Number(inv.amountDue),
      amountPaid: Number(inv.amountPaid),
      balance: Math.max(0, Number(inv.amountDue) - Number(inv.amountPaid)),
      dueDate: inv.dueDate.toISOString(),
      status: inv.status,
    },
    payments: inv.payments.map((p) => ({
      reference: p.reference,
      paidAt: p.paidAt.toISOString(),
      channel: p.channel,
      amount: Number(p.amount),
    })),
    payUrl,
  })

  const filename = `invoice-${inv.invoiceNo}.pdf`
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}
