import ExcelJS from "exceljs"
import { prisma } from "@/lib/db"
import { resolveFinanceAccess } from "@/lib/finance-access"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Multi-sheet Excel workbook of the revenue report: summary, per-class,
 * per-term, channel mix. Same query surface as the JSON endpoint.
 */
export async function GET(req: Request) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const termId = url.searchParams.get("termId")

  const invoiceWhere = {
    schoolId: access.session.schoolId,
    deletedAt: null,
    ...(termId ? { termId } : {}),
  }
  const paymentWhere = {
    schoolId: access.session.schoolId,
    deletedAt: null,
    ...(termId ? { invoice: { termId } } : {}),
  }

  const [invoices, payments, byChannel, terms] = await Promise.all([
    prisma.feeInvoice.findMany({
      where: invoiceWhere,
      include: {
        student: {
          include: {
            user: { select: { firstName: true, lastName: true } },
            enrollments: {
              where: { isActive: true, deletedAt: null },
              take: 1,
              include: { class: { select: { id: true, name: true } } },
            },
          },
        },
        term: { include: { academicYear: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payment.findMany({
      where: paymentWhere,
      include: {
        invoice: {
          include: {
            student: {
              include: { user: { select: { firstName: true, lastName: true } } },
            },
            term: { include: { academicYear: { select: { name: true } } } },
          },
        },
      },
      orderBy: { paidAt: "desc" },
    }),
    prisma.payment.groupBy({
      by: ["channel"],
      where: paymentWhere,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.term.findMany({
      where: { academicYear: { schoolId: access.session.schoolId } },
      include: { academicYear: { select: { name: true } } },
    }),
  ])

  const school = await prisma.school.findUnique({
    where: { id: access.session.schoolId },
    select: { name: true },
  })

  const wb = new ExcelJS.Workbook()
  wb.creator = "EduCore Africa"
  wb.created = new Date()

  // ─── Summary sheet ────────────────────────────────────────────────
  const sumSheet = wb.addWorksheet("Summary")
  sumSheet.addRows([
    ["School", school?.name ?? ""],
    ["Generated", new Date().toISOString().slice(0, 19).replace("T", " ")],
    ["Scope", termId ? `Term ${termId}` : "All terms"],
    [],
    ["Metric", "Value"],
  ])
  const invoiced = invoices.reduce((acc, i) => acc + Number(i.amountDue), 0)
  const collected = invoices.reduce((acc, i) => acc + Number(i.amountPaid), 0)
  sumSheet.addRows([
    ["Invoices", invoices.length],
    ["Invoiced (NGN)", invoiced],
    ["Collected (NGN)", collected],
    ["Outstanding (NGN)", Math.max(0, invoiced - collected)],
    ["Collection rate (%)", invoiced > 0 ? Math.round((collected / invoiced) * 100) : 0],
    ["Payments", payments.length],
    ["Payments total (NGN)", payments.reduce((acc, p) => acc + Number(p.amount), 0)],
  ])
  sumSheet.getColumn(1).width = 28
  sumSheet.getColumn(2).width = 22

  // ─── Per-class ────────────────────────────────────────────────────
  type ClassAgg = { name: string; due: number; paid: number; count: number }
  const classMap = new Map<string, ClassAgg>()
  for (const inv of invoices) {
    const klass = inv.student.enrollments[0]?.class
    if (!klass) continue
    const cur = classMap.get(klass.id) ?? { name: klass.name, due: 0, paid: 0, count: 0 }
    cur.due += Number(inv.amountDue)
    cur.paid += Number(inv.amountPaid)
    cur.count += 1
    classMap.set(klass.id, cur)
  }
  const classSheet = wb.addWorksheet("Per class")
  classSheet.addRow(["Class", "Invoices", "Invoiced", "Collected", "Outstanding", "Collection %"])
  classSheet.getRow(1).font = { bold: true }
  classMap.forEach((c) => {
    classSheet.addRow([
      c.name,
      c.count,
      c.due,
      c.paid,
      Math.max(0, c.due - c.paid),
      c.due > 0 ? Math.round((c.paid / c.due) * 100) : 0,
    ])
  })
  ;[2, 3, 4, 5].forEach((i) => (classSheet.getColumn(i).numFmt = "#,##0"))
  classSheet.getColumn(1).width = 24

  // ─── Per-term ─────────────────────────────────────────────────────
  type TermAgg = { label: string; due: number; paid: number; count: number }
  const termMap = new Map<string, TermAgg>()
  for (const inv of invoices) {
    const label = `${inv.term.academicYear.name} ${inv.term.type[0] + inv.term.type.slice(1).toLowerCase()}`
    const cur = termMap.get(inv.termId) ?? { label, due: 0, paid: 0, count: 0 }
    cur.due += Number(inv.amountDue)
    cur.paid += Number(inv.amountPaid)
    cur.count += 1
    termMap.set(inv.termId, cur)
  }
  const termSheet = wb.addWorksheet("Per term")
  termSheet.addRow(["Term", "Invoices", "Invoiced", "Collected", "Outstanding"])
  termSheet.getRow(1).font = { bold: true }
  termMap.forEach((t) => {
    termSheet.addRow([t.label, t.count, t.due, t.paid, Math.max(0, t.due - t.paid)])
  })
  ;[2, 3, 4, 5].forEach((i) => (termSheet.getColumn(i).numFmt = "#,##0"))
  termSheet.getColumn(1).width = 28
  // term variable usage to silence unused warning
  void terms

  // ─── Channel mix ──────────────────────────────────────────────────
  const channelSheet = wb.addWorksheet("By channel")
  channelSheet.addRow(["Channel", "Count", "Amount (NGN)"])
  channelSheet.getRow(1).font = { bold: true }
  for (const c of byChannel) {
    channelSheet.addRow([c.channel.replace("_", " "), c._count._all, Number(c._sum.amount ?? 0)])
  }
  channelSheet.getColumn(3).numFmt = "#,##0"
  channelSheet.getColumn(1).width = 20

  // ─── Payments raw ─────────────────────────────────────────────────
  const paySheet = wb.addWorksheet("Payments")
  paySheet.addRow([
    "Paid at",
    "Reference",
    "Channel",
    "Amount",
    "Student",
    "Invoice no.",
    "Term",
  ])
  paySheet.getRow(1).font = { bold: true }
  for (const p of payments) {
    paySheet.addRow([
      p.paidAt.toISOString().slice(0, 16).replace("T", " "),
      p.reference,
      p.channel,
      Number(p.amount),
      `${p.invoice.student.user.firstName} ${p.invoice.student.user.lastName}`,
      p.invoice.invoiceNo,
      `${p.invoice.term.academicYear.name} ${p.invoice.term.type}`,
    ])
  }
  paySheet.getColumn(4).numFmt = "#,##0"
  paySheet.getColumn(1).width = 18
  paySheet.getColumn(5).width = 26

  const buf = await wb.xlsx.writeBuffer()
  const filename = `finance-report${termId ? `-${termId}` : ""}.xlsx`
  return new Response(buf, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}
