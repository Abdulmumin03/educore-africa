import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BURSAR"]

type Line = { name: string; amount: number }

function sumLines(lines: Line[] | null | undefined): number {
  if (!lines) return 0
  return lines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0)
}

/**
 * Generate payslips for every active staff member who has a basicSalary set,
 * using their current salary structure. Idempotent — re-runs skip staff who
 * already have a payslip for this period.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const schoolId = session.user.schoolId

  const period = await prisma.payrollPeriod.findFirst({
    where: { id: params.id, schoolId, deletedAt: null },
    select: { id: true, payslips: { select: { staffId: true } } },
  })
  if (!period) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const alreadyPaidStaffIds = new Set(period.payslips.map((p) => p.staffId))

  const staff = await prisma.staff.findMany({
    where: {
      schoolId,
      deletedAt: null,
      status: { in: ["ACTIVE", "ON_LEAVE"] },
      basicSalary: { not: null },
    },
    select: {
      id: true,
      basicSalary: true,
      allowances: true,
      deductions: true,
    },
  })

  const toCreate = staff.filter((s) => !alreadyPaidStaffIds.has(s.id))

  if (toCreate.length === 0) {
    return NextResponse.json({
      ok: true,
      generated: 0,
      skipped: staff.length,
      message: "No new payslips — every eligible staff already has one for this period.",
    })
  }

  const rows = toCreate.map((s) => {
    const allowances = (s.allowances ?? []) as Line[]
    const deductions = (s.deductions ?? []) as Line[]
    const basic = Number(s.basicSalary)
    const gross = basic + sumLines(allowances)
    const net = Math.max(0, gross - sumLines(deductions))
    return {
      schoolId,
      payrollPeriodId: period.id,
      staffId: s.id,
      basicSalary: new Prisma.Decimal(basic),
      allowances,
      deductions,
      gross: new Prisma.Decimal(gross),
      net: new Prisma.Decimal(net),
    }
  })

  await prisma.$transaction([
    prisma.payslip.createMany({ data: rows, skipDuplicates: true }),
    prisma.payrollPeriod.update({
      where: { id: period.id },
      data: { processedAt: new Date(), processedById: session.user.id },
    }),
  ])

  return NextResponse.json({
    ok: true,
    generated: rows.length,
    skipped: alreadyPaidStaffIds.size,
  })
}
