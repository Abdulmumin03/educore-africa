import { NextResponse } from "next/server"
import { Prisma, type FeeStatus } from "@prisma/client"
import { prisma } from "@/lib/db"
import { resolveFinanceAccess } from "@/lib/finance-access"

export const runtime = "nodejs"

/**
 * List invoices with filters: termId, status, classId, sectionId, search,
 * minAmount, maxAmount, plus pagination (page, limit). Returns aggregate
 * counters for the dashboard cards.
 */
export async function GET(req: Request) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1))
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)))
  const search = (url.searchParams.get("search") ?? "").trim()
  const termId = url.searchParams.get("termId")
  const status = url.searchParams.get("status") as FeeStatus | null
  const classId = url.searchParams.get("classId")
  const sectionId = url.searchParams.get("sectionId")
  const minAmount = url.searchParams.get("minAmount")
  const maxAmount = url.searchParams.get("maxAmount")

  const where: Prisma.FeeInvoiceWhereInput = {
    schoolId: access.session.schoolId,
    deletedAt: null,
    ...(termId ? { termId } : {}),
    ...(status ? { status } : {}),
    ...(classId || sectionId
      ? {
          student: {
            enrollments: {
              some: {
                isActive: true,
                deletedAt: null,
                ...(sectionId ? { sectionId } : { section: { classId: classId! } }),
              },
            },
          },
        }
      : {}),
    ...(minAmount || maxAmount
      ? {
          amountDue: {
            ...(minAmount ? { gte: new Prisma.Decimal(minAmount) } : {}),
            ...(maxAmount ? { lte: new Prisma.Decimal(maxAmount) } : {}),
          },
        }
      : {}),
  }
  if (search) {
    where.OR = [
      { invoiceNo: { contains: search, mode: "insensitive" } },
      { student: { admissionNumber: { contains: search, mode: "insensitive" } } },
      { student: { user: { firstName: { contains: search, mode: "insensitive" } } } },
      { student: { user: { lastName: { contains: search, mode: "insensitive" } } } },
    ]
  }

  const [total, rows, statTotals] = await Promise.all([
    prisma.feeInvoice.count({ where }),
    prisma.feeInvoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        student: {
          include: {
            user: { select: { firstName: true, lastName: true, avatarUrl: true } },
            enrollments: {
              where: { isActive: true, deletedAt: null },
              take: 1,
              include: { class: { select: { name: true } }, section: { select: { name: true } } },
            },
          },
        },
        term: { include: { academicYear: { select: { name: true } } } },
      },
    }),
    prisma.feeInvoice.groupBy({
      by: ["status"],
      where: { schoolId: access.session.schoolId, deletedAt: null, ...(termId ? { termId } : {}) },
      _sum: { amountDue: true, amountPaid: true },
      _count: { _all: true },
    }),
  ])

  const totals = { invoiced: 0, collected: 0, outstanding: 0, count: 0, byStatus: {} as Record<string, number> }
  for (const s of statTotals) {
    const due = Number(s._sum.amountDue ?? 0)
    const paid = Number(s._sum.amountPaid ?? 0)
    totals.invoiced += due
    totals.collected += paid
    totals.outstanding += Math.max(0, due - paid)
    totals.count += s._count._all
    totals.byStatus[s.status] = s._count._all
  }

  return NextResponse.json({
    items: rows.map((r) => {
      const enr = r.student.enrollments[0]
      return {
        id: r.id,
        invoiceNo: r.invoiceNo,
        studentId: r.student.id,
        admissionNumber: r.student.admissionNumber,
        firstName: r.student.user.firstName,
        lastName: r.student.user.lastName,
        avatarUrl: r.student.user.avatarUrl,
        className: enr?.class.name ?? null,
        sectionName: enr?.section.name ?? null,
        termType: r.term.type,
        sessionName: r.term.academicYear.name,
        subtotal: Number(r.subtotal),
        discountAmount: Number(r.discountAmount),
        discountReason: r.discountReason,
        amountDue: Number(r.amountDue),
        amountPaid: Number(r.amountPaid),
        balance: Math.max(0, Number(r.amountDue) - Number(r.amountPaid)),
        status: r.status,
        dueDate: r.dueDate.toISOString(),
      }
    }),
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    totals,
  })
}
