import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveStudentAccess } from "@/lib/student-access"

export const runtime = "nodejs"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStudentAccess()
  if (!access.ok) return access.response
  if (access.visibility.ids && !access.visibility.ids.includes(params.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const url = new URL(req.url)
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : null
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : null

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const where = {
    studentId: student.id,
    deletedAt: null,
    ...(from || to
      ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  }

  const [rows, statusCounts] = await Promise.all([
    prisma.attendance.findMany({
      where,
      orderBy: { date: "desc" },
      take: 365,
      select: { id: true, date: true, status: true, remark: true },
    }),
    prisma.attendance.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
  ])

  const totals = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
  for (const c of statusCounts) totals[c.status] = c._count._all
  const totalDays = totals.PRESENT + totals.ABSENT + totals.LATE + totals.EXCUSED
  const percent = totalDays === 0 ? 100 : Math.round(((totals.PRESENT + totals.LATE * 0.5) / totalDays) * 100)

  return NextResponse.json({
    summary: { ...totals, totalDays, percent },
    items: rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      status: r.status,
      remark: r.remark,
    })),
  })
}
