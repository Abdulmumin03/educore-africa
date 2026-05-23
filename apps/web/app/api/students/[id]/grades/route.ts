import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveStudentAccess } from "@/lib/student-access"

export const runtime = "nodejs"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStudentAccess()
  if (!access.ok) return access.response
  if (access.visibility.ids && !access.visibility.ids.includes(params.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const grades = await prisma.grade.findMany({
    where: { studentId: student.id, deletedAt: null },
    include: {
      subject: { select: { name: true, code: true } },
      term: {
        select: {
          type: true,
          academicYear: { select: { name: true, id: true } },
          id: true,
        },
      },
    },
    orderBy: [{ term: { startDate: "desc" } }, { subject: { code: "asc" } }],
  })

  // Group by term for the table.
  const byTerm = new Map<string, { termType: string; sessionName: string; rows: typeof grades }>()
  for (const g of grades) {
    const key = `${g.term.academicYear.id}-${g.term.id}`
    if (!byTerm.has(key)) {
      byTerm.set(key, {
        termType: g.term.type,
        sessionName: g.term.academicYear.name,
        rows: [],
      })
    }
    byTerm.get(key)!.rows.push(g)
  }

  const terms = Array.from(byTerm.values()).map((t) => {
    const totals = t.rows.map((r) => r.totalScore)
    const average = totals.length
      ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100
      : 0
    return {
      termType: t.termType,
      sessionName: t.sessionName,
      average,
      rows: t.rows.map((r) => ({
        subject: r.subject.name,
        code: r.subject.code,
        ca: r.caScore,
        exam: r.examScore,
        total: r.totalScore,
        letterGrade: r.letterGrade,
        remark: r.remark,
      })),
    }
  })

  // Trend = last 3 terms ordered chronologically.
  const trend = [...terms].slice(0, 3).reverse().map((t) => ({
    label: `${t.sessionName} · ${t.termType}`,
    average: t.average,
  }))

  return NextResponse.json({ terms, trend })
}
