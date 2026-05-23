import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveStaffAccess } from "@/lib/staff-access"

export const runtime = "nodejs"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response

  const staff = await prisma.staff.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: {
      id: true,
      basicSalary: true,
      allowances: true,
      deductions: true,
      bankName: true,
      accountNumber: true,
      accountName: true,
    },
  })
  if (!staff) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const rows = await prisma.payslip.findMany({
    where: { staffId: staff.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { payrollPeriod: { select: { name: true, startDate: true, endDate: true } } },
  })

  return NextResponse.json({
    structure: {
      basicSalary: staff.basicSalary ? Number(staff.basicSalary) : 0,
      allowances: (staff.allowances ?? []) as { name: string; amount: number }[],
      deductions: (staff.deductions ?? []) as { name: string; amount: number }[],
      bank: staff.bankName
        ? { name: staff.bankName, accountNumber: staff.accountNumber, accountName: staff.accountName }
        : null,
    },
    items: rows.map((p) => ({
      id: p.id,
      periodName: p.payrollPeriod.name,
      periodStart: p.payrollPeriod.startDate.toISOString(),
      periodEnd: p.payrollPeriod.endDate.toISOString(),
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
