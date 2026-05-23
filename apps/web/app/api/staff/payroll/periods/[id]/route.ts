import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const READ_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "BURSAR"]

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!READ_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const period = await prisma.payrollPeriod.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    include: {
      payslips: {
        where: { deletedAt: null },
        orderBy: { staff: { user: { lastName: "asc" } } },
        include: {
          staff: {
            select: {
              id: true,
              staffNumber: true,
              department: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  })
  if (!period) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    id: period.id,
    name: period.name,
    startDate: period.startDate.toISOString(),
    endDate: period.endDate.toISOString(),
    processedAt: period.processedAt?.toISOString() ?? null,
    payslips: period.payslips.map((p) => ({
      id: p.id,
      staff: {
        id: p.staff.id,
        staffNumber: p.staff.staffNumber,
        firstName: p.staff.user.firstName,
        lastName: p.staff.user.lastName,
        department: p.staff.department,
      },
      basicSalary: Number(p.basicSalary),
      allowances: (p.allowances ?? []) as { name: string; amount: number }[],
      deductions: (p.deductions ?? []) as { name: string; amount: number }[],
      gross: Number(p.gross),
      net: Number(p.net),
      paidAt: p.paidAt?.toISOString() ?? null,
      note: p.note,
    })),
  })
}
