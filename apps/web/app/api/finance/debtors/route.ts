import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveFinanceAccess } from "@/lib/finance-access"

export const runtime = "nodejs"

/**
 * List of invoices with an outstanding balance, sorted worst-overdue first.
 * Powers /dashboard/finance/debtors and the bulk-reminder UI.
 */
export async function GET(req: Request) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const termId = url.searchParams.get("termId")
  const classId = url.searchParams.get("classId")
  const minDaysOverdue = Math.max(0, Number(url.searchParams.get("minDaysOverdue") ?? 0))

  const invoices = await prisma.feeInvoice.findMany({
    where: {
      schoolId: access.session.schoolId,
      deletedAt: null,
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      ...(termId ? { termId } : {}),
      ...(classId
        ? {
            student: {
              enrollments: {
                some: { isActive: true, deletedAt: null, section: { classId } },
              },
            },
          }
        : {}),
    },
    orderBy: { dueDate: "asc" },
    take: 500,
    include: {
      student: {
        include: {
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
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
    },
  })

  const now = Date.now()
  const items = invoices
    .map((inv) => {
      const balance = Math.max(0, Number(inv.amountDue) - Number(inv.amountPaid))
      if (balance <= 0) return null
      const daysOverdue = Math.floor((now - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24))
      if (daysOverdue < minDaysOverdue) return null
      const enr = inv.student.enrollments[0]
      const primary = inv.student.parents[0]?.parent
      return {
        invoiceId: inv.id,
        invoiceNo: inv.invoiceNo,
        studentId: inv.student.id,
        admissionNumber: inv.student.admissionNumber,
        firstName: inv.student.user.firstName,
        lastName: inv.student.user.lastName,
        avatarUrl: inv.student.user.avatarUrl,
        className: enr?.class.name ?? null,
        sectionName: enr?.section.name ?? null,
        termType: inv.term.type,
        sessionName: inv.term.academicYear.name,
        amountDue: Number(inv.amountDue),
        amountPaid: Number(inv.amountPaid),
        balance,
        dueDate: inv.dueDate.toISOString(),
        daysOverdue,
        status: inv.status,
        guardianName: primary
          ? `${primary.user.firstName} ${primary.user.lastName}`
          : null,
        guardianPhone: primary?.user.phone ?? null,
        guardianEmail: primary?.user.email ?? null,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.daysOverdue - a.daysOverdue)

  const totals = items.reduce(
    (acc, it) => {
      acc.balance += it.balance
      acc.count += 1
      return acc
    },
    { balance: 0, count: 0 },
  )

  return NextResponse.json({ items, totals })
}
