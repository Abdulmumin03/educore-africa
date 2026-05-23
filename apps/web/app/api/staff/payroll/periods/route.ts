import { NextResponse } from "next/server"
import { z } from "zod"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const READ_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "BURSAR"]
const WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BURSAR"]

const createSchema = z.object({
  name: z.string().trim().min(2).max(40), // e.g. "2026-05"
  startDate: z.string().min(1),
  endDate: z.string().min(1),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!READ_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const periods = await prisma.payrollPeriod.findMany({
    where: { schoolId: session.user.schoolId, deletedAt: null },
    orderBy: { startDate: "desc" },
    take: 50,
    include: {
      _count: { select: { payslips: true } },
      payslips: {
        where: { deletedAt: null },
        select: { gross: true, net: true, paidAt: true },
      },
    },
  })

  return NextResponse.json({
    items: periods.map((p) => {
      const totals = p.payslips.reduce(
        (acc, ps) => ({
          gross: acc.gross + Number(ps.gross),
          net: acc.net + Number(ps.net),
          paid: acc.paid + (ps.paidAt ? 1 : 0),
        }),
        { gross: 0, net: 0, paid: 0 },
      )
      return {
        id: p.id,
        name: p.name,
        startDate: p.startDate.toISOString(),
        endDate: p.endDate.toISOString(),
        processedAt: p.processedAt?.toISOString() ?? null,
        payslipCount: p._count.payslips,
        paidCount: totals.paid,
        totalGross: totals.gross,
        totalNet: totals.net,
      }
    }),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { name, startDate, endDate } = parsed.data
  if (new Date(endDate).getTime() < new Date(startDate).getTime()) {
    return NextResponse.json({ error: "endDate must be on or after startDate" }, { status: 422 })
  }

  try {
    const period = await prisma.payrollPeriod.create({
      data: {
        schoolId: session.user.schoolId,
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
      select: { id: true, name: true },
    })
    return NextResponse.json({ ok: true, ...period }, { status: 201 })
  } catch (err) {
    const message =
      err instanceof Error && /Unique constraint/i.test(err.message)
        ? "A period with that name already exists"
        : "Couldn't create period"
    console.error("[payroll/periods]", err)
    return NextResponse.json({ error: message }, { status: 409 })
  }
}
