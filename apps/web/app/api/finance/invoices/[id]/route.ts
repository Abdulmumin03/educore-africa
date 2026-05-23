import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveFinanceAccess } from "@/lib/finance-access"

export const runtime = "nodejs"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response

  const inv = await prisma.feeInvoice.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    include: {
      student: {
        include: {
          user: { select: { firstName: true, lastName: true, email: true, phone: true, avatarUrl: true } },
          enrollments: {
            where: { isActive: true, deletedAt: null },
            take: 1,
            include: { class: { select: { name: true } }, section: { select: { name: true } } },
          },
          parents: {
            where: { isPrimary: true },
            include: { parent: { include: { user: { select: { firstName: true, lastName: true, phone: true, email: true } } } } },
          },
        },
      },
      term: { include: { academicYear: { select: { name: true } } } },
      payments: {
        where: { deletedAt: null },
        orderBy: { paidAt: "desc" },
      },
      school: {
        select: { name: true, address: true, phone: true, email: true, logoUrl: true, motto: true },
      },
    },
  })
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const enr = inv.student.enrollments[0]
  const primary = inv.student.parents[0]?.parent

  return NextResponse.json({
    id: inv.id,
    invoiceNo: inv.invoiceNo,
    status: inv.status,
    items: (inv.items ?? []) as { name: string; category: string; amount: number; isMandatory: boolean; dueDate: string | null }[],
    subtotal: Number(inv.subtotal),
    discountAmount: Number(inv.discountAmount),
    discountReason: inv.discountReason,
    amountDue: Number(inv.amountDue),
    amountPaid: Number(inv.amountPaid),
    balance: Math.max(0, Number(inv.amountDue) - Number(inv.amountPaid)),
    dueDate: inv.dueDate.toISOString(),
    notes: inv.notes,
    student: {
      id: inv.student.id,
      admissionNumber: inv.student.admissionNumber,
      firstName: inv.student.user.firstName,
      lastName: inv.student.user.lastName,
      avatarUrl: inv.student.user.avatarUrl,
      className: enr?.class.name ?? null,
      sectionName: enr?.section.name ?? null,
    },
    primaryGuardian: primary
      ? {
          name: `${primary.user.firstName} ${primary.user.lastName}`,
          phone: primary.user.phone,
          email: primary.user.email,
        }
      : null,
    term: {
      id: inv.termId,
      type: inv.term.type,
      sessionName: inv.term.academicYear.name,
    },
    school: inv.school,
    payments: inv.payments.map((p) => ({
      id: p.id,
      reference: p.reference,
      amount: Number(p.amount),
      channel: p.channel,
      paidAt: p.paidAt.toISOString(),
      payerName: p.payerName,
      payerPhone: p.payerPhone,
      notes: p.notes,
      evidenceUrl: p.evidenceUrl,
    })),
  })
}
