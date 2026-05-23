import { prisma } from "@/lib/db"
import { resolveAttendanceAccess } from "@/lib/attendance-access"
import { dayOnly } from "@/lib/attendance-schemas"
import {
  renderClassReportPdf,
  renderStudentReportPdf,
} from "@/lib/attendance-report-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const access = await resolveAttendanceAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const type = url.searchParams.get("type")
  if (type !== "class" && type !== "student") {
    return new Response("type must be class or student", { status: 422 })
  }

  const school = await prisma.school.findUnique({
    where: { id: access.session.schoolId },
    select: { name: true, address: true, phone: true, email: true },
  })
  if (!school) return new Response("School not found", { status: 404 })

  const fromStr = url.searchParams.get("from")
  const toStr = url.searchParams.get("to")
  const from = fromStr ? dayOnly(fromStr) : null
  const to = toStr ? dayOnly(toStr) : null

  if (type === "class") {
    const sectionId = url.searchParams.get("sectionId")
    if (!sectionId) return new Response("sectionId required", { status: 422 })

    const section = await prisma.section.findFirst({
      where: { id: sectionId, schoolId: access.session.schoolId, deletedAt: null },
      include: { class: { select: { name: true } } },
    })
    if (!section) return new Response("Not found", { status: 404 })

    // No user-supplied range → fall back to current term by termId only.
    // displayFrom/displayTo are for the PDF header; the actual query trusts
    // Attendance.termId (canonical) rather than the term's calendar dates,
    // which could mismatch when isCurrent hasn't been rotated.
    let termId: string | null = null
    let displayFrom = from
    let displayTo = to
    if (!from && !to) {
      const term = await prisma.term.findFirst({
        where: { isCurrent: true, academicYear: { schoolId: access.session.schoolId } },
        select: { id: true, startDate: true, endDate: true },
      })
      if (term) {
        termId = term.id
        displayFrom = term.startDate
        displayTo = term.endDate
      }
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { sectionId, isActive: true, deletedAt: null },
      include: {
        student: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { student: { user: { lastName: "asc" } } },
    })
    const studentIds = enrollments.map((e) => e.student.id)
    const counts =
      studentIds.length === 0
        ? []
        : await prisma.attendance.groupBy({
            by: ["studentId", "status"],
            where: {
              schoolId: access.session.schoolId,
              sectionId,
              studentId: { in: studentIds },
              deletedAt: null,
              ...(termId ? { termId } : {}),
              ...(from || to
                ? {
                    date: {
                      ...(from ? { gte: from } : {}),
                      ...(to ? { lte: to } : {}),
                    },
                  }
                : {}),
            },
            _count: { _all: true },
          })

    type Agg = { present: number; absent: number; late: number; excused: number }
    const map = new Map<string, Agg>()
    for (const c of counts) {
      const a = map.get(c.studentId) ?? { present: 0, absent: 0, late: 0, excused: 0 }
      if (c.status === "PRESENT") a.present += c._count._all
      if (c.status === "ABSENT") a.absent += c._count._all
      if (c.status === "LATE") a.late += c._count._all
      if (c.status === "EXCUSED") a.excused += c._count._all
      map.set(c.studentId, a)
    }

    const rows = enrollments.map((e) => {
      const a = map.get(e.student.id) ?? { present: 0, absent: 0, late: 0, excused: 0 }
      const total = a.present + a.absent + a.late + a.excused
      const percent = total === 0 ? null : Math.round(((a.present + a.late * 0.5) / total) * 100)
      return {
        studentId: e.student.id,
        admissionNumber: e.student.admissionNumber,
        firstName: e.student.user.firstName,
        lastName: e.student.user.lastName,
        present: a.present,
        absent: a.absent,
        late: a.late,
        excused: a.excused,
        totalDays: total,
        percent,
      }
    })

    const pdf = await renderClassReportPdf({
      school,
      section: { name: section.name, className: section.class.name },
      from: displayFrom?.toISOString() ?? null,
      to: displayTo?.toISOString() ?? null,
      rows,
      generatedAt: new Date().toISOString(),
    })
    const filename = `attendance-${section.class.name}-arm${section.name}.pdf`.replace(/\s+/g, "_")
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    })
  }

  // Student report
  const studentId = url.searchParams.get("studentId")
  if (!studentId) return new Response("studentId required", { status: 422 })
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: access.session.schoolId, deletedAt: null },
    include: {
      user: { select: { firstName: true, lastName: true } },
      enrollments: {
        where: { isActive: true, deletedAt: null },
        take: 1,
        include: { class: { select: { name: true } }, section: { select: { name: true } } },
      },
    },
  })
  if (!student) return new Response("Not found", { status: 404 })

  let termId: string | null = null
  if (!from && !to) {
    const term = await prisma.term.findFirst({
      where: { isCurrent: true, academicYear: { schoolId: access.session.schoolId } },
      select: { id: true },
    })
    termId = term?.id ?? null
  }

  const where = {
    studentId: student.id,
    deletedAt: null,
    ...(termId ? { termId } : {}),
    ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  }

  const [items, counts] = await Promise.all([
    prisma.attendance.findMany({ where, orderBy: { date: "desc" }, take: 200, select: { date: true, status: true, remark: true } }),
    prisma.attendance.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ])
  const totals = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
  for (const c of counts) totals[c.status] = c._count._all
  const totalDays = totals.PRESENT + totals.ABSENT + totals.LATE + totals.EXCUSED
  const percent =
    totalDays === 0 ? null : Math.round(((totals.PRESENT + totals.LATE * 0.5) / totalDays) * 100)

  const pdf = await renderStudentReportPdf({
    school,
    student: {
      name: `${student.user.firstName} ${student.user.lastName}`,
      admissionNumber: student.admissionNumber,
      className: student.enrollments[0]?.class.name ?? null,
      sectionName: student.enrollments[0]?.section.name ?? null,
    },
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    summary: { ...totals, totalDays, percent },
    items: items.map((i) => ({
      date: i.date.toISOString().slice(0, 10),
      status: i.status,
      remark: i.remark,
    })),
    generatedAt: new Date().toISOString(),
  })
  const filename = `attendance-${student.admissionNumber}.pdf`
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}
