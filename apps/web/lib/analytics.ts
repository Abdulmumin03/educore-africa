import { prisma } from "@/lib/db"

/**
 * Analytics queries — one function per report tab. Each takes a date range
 * (inclusive of both ends) and returns a plain JSON-serialisable payload.
 *
 * Heads-up on dev data: most of these will return mostly-empty results in a
 * fresh school. The frontend should render zero-states gracefully.
 */

type Range = { schoolId: string; from: Date; to: Date }

export async function academicAnalytics({ schoolId, from, to }: Range) {
  const grades = await prisma.grade.findMany({
    where: {
      schoolId,
      deletedAt: null,
      createdAt: { gte: from, lte: to },
    },
    select: {
      totalScore: true,
      subjectId: true,
      studentId: true,
      subject: { select: { name: true, code: true } },
      student: {
        select: {
          enrollments: {
            where: { isActive: true, deletedAt: null },
            select: { class: { select: { id: true, name: true } } },
            take: 1,
          },
        },
      },
    },
  })

  // Class averages
  const classAggregates = new Map<string, { name: string; sum: number; count: number }>()
  // Subject × class matrix
  const matrix = new Map<string, Map<string, { sum: number; count: number }>>()

  for (const g of grades) {
    const klass = g.student.enrollments[0]?.class
    if (!klass) continue
    const ca = classAggregates.get(klass.id) ?? { name: klass.name, sum: 0, count: 0 }
    ca.sum += g.totalScore
    ca.count += 1
    classAggregates.set(klass.id, ca)

    const row = matrix.get(klass.id) ?? new Map()
    const cell = row.get(g.subjectId) ?? { sum: 0, count: 0 }
    cell.sum += g.totalScore
    cell.count += 1
    row.set(g.subjectId, cell)
    matrix.set(klass.id, row)
  }

  const classes = Array.from(classAggregates.entries()).map(([id, v]) => ({
    classId: id,
    name: v.name,
    average: v.count > 0 ? Math.round((v.sum / v.count) * 10) / 10 : 0,
    count: v.count,
  }))

  // Build subject set
  const subjectIds = new Set<string>()
  for (const m of Array.from(matrix.values())) {
    for (const s of Array.from(m.keys())) subjectIds.add(s)
  }
  const subjects = await prisma.subject.findMany({
    where: { id: { in: Array.from(subjectIds) } },
    select: { id: true, name: true, code: true },
  })
  const subjectById = new Map(subjects.map((s) => [s.id, s]))

  const heatmap = classes
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      classId: c.classId,
      className: c.name,
      cells: Array.from(matrix.get(c.classId)?.entries() ?? []).map(
        ([subjectId, v]) => ({
          subjectId,
          subjectName: subjectById.get(subjectId)?.name ?? "?",
          subjectCode: subjectById.get(subjectId)?.code ?? "?",
          average: v.count > 0 ? Math.round((v.sum / v.count) * 10) / 10 : 0,
        }),
      ),
    }))

  return {
    classes: classes.sort((a, b) => b.average - a.average),
    heatmap,
    subjects: subjects.sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export async function attendanceAnalytics({ schoolId, from, to }: Range) {
  const rows = await prisma.attendance.findMany({
    where: { schoolId, deletedAt: null, date: { gte: from, lte: to } },
    select: {
      status: true,
      date: true,
      studentId: true,
      section: { select: { classId: true, class: { select: { name: true } } } },
    },
  })

  // Monthly trend
  const monthly = new Map<string, { present: number; total: number }>()
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 7) // YYYY-MM
    const b = monthly.get(key) ?? { present: 0, total: 0 }
    if (r.status === "PRESENT") b.present += 1
    b.total += 1
    monthly.set(key, b)
  }
  const trend = Array.from(monthly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      presentPct: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
      total: v.total,
    }))

  // Class ranking
  const byClass = new Map<string, { name: string; present: number; total: number }>()
  for (const r of rows) {
    if (!r.section) continue
    const id = r.section.classId
    const b = byClass.get(id) ?? { name: r.section.class.name, present: 0, total: 0 }
    if (r.status === "PRESENT") b.present += 1
    b.total += 1
    byClass.set(id, b)
  }
  const classRanking = Array.from(byClass.entries())
    .map(([classId, v]) => ({
      classId,
      name: v.name,
      presentPct: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
      total: v.total,
    }))
    .sort((a, b) => b.presentPct - a.presentPct)

  // Top 20 most absent
  const absentByStudent = new Map<string, number>()
  for (const r of rows) {
    if (r.status === "ABSENT") {
      absentByStudent.set(r.studentId, (absentByStudent.get(r.studentId) ?? 0) + 1)
    }
  }
  const topAbsentIds = Array.from(absentByStudent.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
  const students = topAbsentIds.length
    ? await prisma.student.findMany({
        where: { id: { in: topAbsentIds.map(([id]) => id) } },
        select: {
          id: true,
          admissionNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      })
    : []
  const studentMap = new Map(students.map((s) => [s.id, s]))
  const topAbsent = topAbsentIds
    .map(([id, count]) => {
      const s = studentMap.get(id)
      return s
        ? {
            id: s.id,
            admissionNumber: s.admissionNumber,
            name: `${s.user.firstName} ${s.user.lastName}`,
            absences: count,
          }
        : null
    })
    .filter(Boolean) as { id: string; admissionNumber: string; name: string; absences: number }[]

  return { trend, classRanking, topAbsent }
}

export async function financialAnalytics({ schoolId, from, to }: Range) {
  const [payments, invoices] = await Promise.all([
    prisma.payment.findMany({
      where: { schoolId, deletedAt: null, paidAt: { gte: from, lte: to } },
      select: { amount: true, paidAt: true, channel: true },
    }),
    prisma.feeInvoice.findMany({
      where: { schoolId, deletedAt: null, createdAt: { gte: from, lte: to } },
      select: {
        amountDue: true,
        amountPaid: true,
        items: true,
        student: {
          select: {
            enrollments: {
              where: { isActive: true, deletedAt: null },
              select: { class: { select: { id: true, name: true } } },
              take: 1,
            },
          },
        },
      },
    }),
  ])

  // Revenue by month
  const monthly = new Map<string, number>()
  for (const p of payments) {
    const key = p.paidAt.toISOString().slice(0, 7)
    monthly.set(key, (monthly.get(key) ?? 0) + Number(p.amount))
  }
  const revenueByMonth = Array.from(monthly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, total }))

  // Collection rate by class
  const classAgg = new Map<string, { name: string; billed: number; paid: number }>()
  for (const inv of invoices) {
    const klass = inv.student.enrollments[0]?.class
    if (!klass) continue
    const b = classAgg.get(klass.id) ?? { name: klass.name, billed: 0, paid: 0 }
    b.billed += Number(inv.amountDue)
    b.paid += Number(inv.amountPaid)
    classAgg.set(klass.id, b)
  }
  const collectionByClass = Array.from(classAgg.entries())
    .map(([classId, v]) => ({
      classId,
      name: v.name,
      billed: v.billed,
      paid: v.paid,
      ratePct: v.billed > 0 ? Math.round((v.paid / v.billed) * 100) : 0,
    }))
    .sort((a, b) => b.ratePct - a.ratePct)

  // Fee component breakdown (from invoice items JSON)
  const components = new Map<string, number>()
  for (const inv of invoices) {
    if (!Array.isArray(inv.items)) continue
    for (const item of inv.items as Array<{ category?: string; name?: string; amount?: number }>) {
      const key = item.category ?? item.name ?? "Other"
      components.set(key, (components.get(key) ?? 0) + Number(item.amount ?? 0))
    }
  }
  const feeComponents = Array.from(components.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  return { revenueByMonth, collectionByClass, feeComponents }
}

export async function enrollmentAnalytics({ schoolId, from, to }: Range) {
  const enrollments = await prisma.enrollment.findMany({
    where: { schoolId, deletedAt: null, enrolledOn: { gte: from, lte: to } },
    select: {
      enrolledOn: true,
      student: { select: { gender: true, admissionType: true } },
      class: { select: { name: true, level: true } },
    },
  })

  // Gender breakdown
  const genderMap = new Map<string, number>()
  for (const e of enrollments) {
    const g = e.student.gender ?? "UNSPECIFIED"
    genderMap.set(g, (genderMap.get(g) ?? 0) + 1)
  }
  const byGender = Array.from(genderMap.entries()).map(([name, value]) => ({ name, value }))

  // Class level distribution
  const levelMap = new Map<string, number>()
  for (const e of enrollments) {
    levelMap.set(e.class.name, (levelMap.get(e.class.name) ?? 0) + 1)
  }
  const byClassLevel = Array.from(levelMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  // New vs returning (NEW admission type = new; others = returning)
  let newCount = 0
  let returningCount = 0
  for (const e of enrollments) {
    if (e.student.admissionType === "NEW") newCount += 1
    else returningCount += 1
  }

  return {
    byGender,
    byClassLevel,
    newVsReturning: [
      { name: "New", value: newCount },
      { name: "Returning", value: returningCount },
    ],
    total: enrollments.length,
  }
}

export async function staffAnalytics({ schoolId, from, to }: Range) {
  // Teacher attendance %
  const attendance = await prisma.staffAttendance.findMany({
    where: { schoolId, date: { gte: from, lte: to }, deletedAt: null },
    select: {
      staffId: true,
      status: true,
      staff: {
        select: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  })
  const attMap = new Map<
    string,
    { name: string; present: number; total: number }
  >()
  for (const a of attendance) {
    const key = a.staffId
    const b = attMap.get(key) ?? {
      name: `${a.staff.user.firstName} ${a.staff.user.lastName}`,
      present: 0,
      total: 0,
    }
    if (a.status === "PRESENT" || a.status === "LATE") b.present += 1
    b.total += 1
    attMap.set(key, b)
  }
  const attendancePct = Array.from(attMap.entries())
    .map(([staffId, v]) => ({
      staffId,
      name: v.name,
      ratePct: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
      days: v.total,
    }))
    .sort((a, b) => b.ratePct - a.ratePct)
    .slice(0, 25)

  // Workload — count timetable slots per teacher
  const slots = await prisma.timetable.groupBy({
    by: ["teacherId"],
    where: { schoolId, deletedAt: null },
    _count: { _all: true },
  })
  const workloadStaffIds = slots.map((s) => s.teacherId)
  const workloadStaff = workloadStaffIds.length
    ? await prisma.staff.findMany({
        where: { id: { in: workloadStaffIds } },
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true } },
        },
      })
    : []
  const wsMap = new Map(workloadStaff.map((s) => [s.id, s]))
  const workload = slots
    .map((s) => ({
      staffId: s.teacherId,
      name: wsMap.get(s.teacherId)
        ? `${wsMap.get(s.teacherId)!.user.firstName} ${wsMap.get(s.teacherId)!.user.lastName}`
        : "?",
      periodsPerWeek: s._count._all,
    }))
    .sort((a, b) => b.periodsPerWeek - a.periodsPerWeek)
    .slice(0, 25)

  // Performance leaderboard from Evaluation
  const evals = await prisma.evaluation.findMany({
    where: {
      schoolId,
      finalScore: { not: null },
      finalizedAt: { gte: from, lte: to },
    },
    orderBy: { finalScore: "desc" },
    take: 10,
    select: {
      finalScore: true,
      badge: true,
      staff: {
        select: { id: true, user: { select: { firstName: true, lastName: true } } },
      },
    },
  })
  const performance = evals
    .filter((e) => e.finalScore !== null)
    .map((e) => ({
      staffId: e.staff.id,
      name: `${e.staff.user.firstName} ${e.staff.user.lastName}`,
      score: Math.round((e.finalScore ?? 0) * 10) / 10,
      badge: e.badge,
    }))

  return { attendancePct, workload, performance }
}

export async function predictionsAnalytics({ schoolId }: Range) {
  // Latest risk score per student
  const risks = await prisma.aIRiskScore.findMany({
    where: { schoolId, deletedAt: null },
    orderBy: { computedAt: "desc" },
    take: 2000,
    select: {
      studentId: true,
      level: true,
      score: true,
      computedAt: true,
      student: {
        select: {
          id: true,
          enrollments: {
            where: { isActive: true, deletedAt: null },
            select: { class: { select: { id: true, name: true } } },
            take: 1,
          },
        },
      },
    },
  })
  const seen = new Set<string>()
  const latest = risks.filter((r) => {
    if (seen.has(r.studentId)) return false
    seen.add(r.studentId)
    return true
  })

  // At-risk count per class
  const classMap = new Map<string, { name: string; high: number; medium: number; low: number }>()
  for (const r of latest) {
    const klass = r.student.enrollments[0]?.class
    if (!klass) continue
    const b = classMap.get(klass.id) ?? { name: klass.name, high: 0, medium: 0, low: 0 }
    if (r.level === "HIGH" || r.level === "CRITICAL") b.high += 1
    else if (r.level === "MEDIUM") b.medium += 1
    else b.low += 1
    classMap.set(klass.id, b)
  }
  const atRiskByClass = Array.from(classMap.entries())
    .map(([classId, v]) => ({
      classId,
      name: v.name,
      high: v.high,
      medium: v.medium,
      low: v.low,
    }))
    .sort((a, b) => b.high - a.high)

  // Payment default predictions: classes with the lowest collection rate so far
  const invoices = await prisma.feeInvoice.findMany({
    where: { schoolId, deletedAt: null, status: { in: ["PARTIAL", "OVERDUE", "PENDING"] } },
    select: {
      amountDue: true,
      amountPaid: true,
      student: {
        select: {
          enrollments: {
            where: { isActive: true, deletedAt: null },
            select: { class: { select: { id: true, name: true } } },
            take: 1,
          },
        },
      },
    },
  })
  const pmtMap = new Map<string, { name: string; billed: number; paid: number; count: number }>()
  for (const inv of invoices) {
    const klass = inv.student.enrollments[0]?.class
    if (!klass) continue
    const b = pmtMap.get(klass.id) ?? { name: klass.name, billed: 0, paid: 0, count: 0 }
    b.billed += Number(inv.amountDue)
    b.paid += Number(inv.amountPaid)
    b.count += 1
    pmtMap.set(klass.id, b)
  }
  const defaultRisk = Array.from(pmtMap.entries())
    .map(([classId, v]) => ({
      classId,
      name: v.name,
      ratePct: v.billed > 0 ? Math.round((v.paid / v.billed) * 100) : 0,
      outstanding: Math.max(0, v.billed - v.paid),
      openInvoices: v.count,
    }))
    .sort((a, b) => a.ratePct - b.ratePct)

  return { atRiskByClass, defaultRisk }
}
