import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { resolveFinanceAccess } from "@/lib/finance-access"

export const runtime = "nodejs"

/** Awarded student discounts list, with optional ?status= and ?studentId= filters. */
export async function GET(req: Request) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const status = url.searchParams.get("status")
  const studentId = url.searchParams.get("studentId")

  const where: Prisma.StudentDiscountWhereInput = {
    schoolId: access.session.schoolId,
    deletedAt: null,
    ...(studentId ? { studentId } : {}),
    ...(status &&
    ["PENDING", "APPROVED", "REJECTED", "REVOKED"].includes(status)
      ? { status: status as "PENDING" | "APPROVED" | "REJECTED" | "REVOKED" }
      : {}),
  }

  const rows = await prisma.studentDiscount.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      discount: true,
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
    },
  })

  return NextResponse.json({
    items: rows.map((r) => {
      const enr = r.student.enrollments[0]
      return {
        id: r.id,
        studentId: r.studentId,
        admissionNumber: r.student.admissionNumber,
        firstName: r.student.user.firstName,
        lastName: r.student.user.lastName,
        avatarUrl: r.student.user.avatarUrl,
        className: enr?.class.name ?? null,
        sectionName: enr?.section.name ?? null,
        discountId: r.discountId,
        discountName: r.discount.name,
        discountType: r.discount.type,
        percent: r.discount.percent ? Number(r.discount.percent) : null,
        fixedAmount: r.discount.fixedAmount ? Number(r.discount.fixedAmount) : null,
        status: r.status,
        reason: r.reason,
        approvedAt: r.approvedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      }
    }),
  })
}
