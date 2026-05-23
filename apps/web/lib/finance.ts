import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"

export type FeeItem = {
  name: string
  category: string
  amount: number
  isMandatory: boolean
  dueDate?: string | null
}

/**
 * Generate a unique invoice number: <SLUG3>-INV-YYYY-NNNN. Per-school per-year
 * counter. Caller should retry on a unique-constraint collision.
 */
export async function generateInvoiceNumber(opts: {
  schoolId: string
  schoolSlug: string
  year?: number
}): Promise<string> {
  const year = opts.year ?? new Date().getFullYear()
  const prefix = `${(opts.schoolSlug.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase() || "SCH")}-INV-${year}-`
  const latest = await prisma.feeInvoice.findFirst({
    where: { schoolId: opts.schoolId, invoiceNo: { startsWith: prefix } },
    orderBy: { invoiceNo: "desc" },
    select: { invoiceNo: true },
  })
  const lastNumber = latest ? Number(latest.invoiceNo.slice(prefix.length)) || 0 : 0
  return `${prefix}${String(lastNumber + 1).padStart(4, "0")}`
}

/**
 * Compute the best-eligible discount for a student against a given subtotal,
 * applying auto-apply rules (sibling) and any awarded one-off discounts.
 * Returns the picked discount (highest reduction) or null.
 *
 * Sibling auto-apply: applies to the 2nd+ active sibling at the school.
 */
export async function pickStudentDiscount(opts: {
  schoolId: string
  studentId: string
  subtotal: number
}): Promise<{
  amount: number
  reason: string
  discountId: string | null
} | null> {
  const [awarded, autoDiscounts, siblingsOlder] = await Promise.all([
    prisma.studentDiscount.findMany({
      where: {
        schoolId: opts.schoolId,
        studentId: opts.studentId,
        status: "APPROVED",
        deletedAt: null,
      },
      include: { discount: true },
    }),
    prisma.feeDiscount.findMany({
      where: {
        schoolId: opts.schoolId,
        isActive: true,
        autoApply: true,
        deletedAt: null,
      },
    }),
    // Number of active siblings at this school with admission_date before this student's.
    prisma.student.findFirst({
      where: { id: opts.studentId },
      select: { admissionDate: true, parents: { select: { parentId: true } } },
    }),
  ])

  const candidates: Array<{ amount: number; reason: string; discountId: string | null }> = []

  for (const a of awarded) {
    const amt = a.discount.percent
      ? Math.round(opts.subtotal * (Number(a.discount.percent) / 100) * 100) / 100
      : a.discount.fixedAmount
        ? Number(a.discount.fixedAmount)
        : 0
    if (amt > 0) {
      candidates.push({
        amount: amt,
        reason: a.discount.name,
        discountId: a.discount.id,
      })
    }
  }

  // SIBLING auto-apply: count older active siblings sharing a parent.
  if (siblingsOlder?.parents.length) {
    const parentIds = siblingsOlder.parents.map((p) => p.parentId)
    const olderSibling = await prisma.student.findFirst({
      where: {
        schoolId: opts.schoolId,
        id: { not: opts.studentId },
        deletedAt: null,
        status: "ACTIVE",
        admissionDate: { lt: siblingsOlder.admissionDate },
        parents: { some: { parentId: { in: parentIds } } },
      },
      select: { id: true },
    })
    if (olderSibling) {
      const sibling = autoDiscounts.find((d) => d.type === "SIBLING")
      if (sibling) {
        const amt = sibling.percent
          ? Math.round(opts.subtotal * (Number(sibling.percent) / 100) * 100) / 100
          : sibling.fixedAmount
            ? Number(sibling.fixedAmount)
            : 0
        if (amt > 0) {
          candidates.push({
            amount: amt,
            reason: `${sibling.name} (auto)`,
            discountId: sibling.id,
          })
        }
      }
    }
  }

  if (candidates.length === 0) return null
  // Pick the biggest reduction.
  candidates.sort((a, b) => b.amount - a.amount)
  return candidates[0]
}

export function recomputeInvoiceStatus(
  amountDue: number,
  amountPaid: number,
  dueDate: Date,
): "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" | "WAIVED" {
  if (amountDue <= 0) return "WAIVED"
  if (amountPaid >= amountDue) return "PAID"
  if (amountPaid > 0) return "PARTIAL"
  if (dueDate.getTime() < Date.now()) return "OVERDUE"
  return "PENDING"
}

/**
 * Bump invoice amountPaid + recompute status. Idempotent — pass the new total
 * amountPaid, not a delta.
 */
export async function refreshInvoiceTotals(invoiceId: string): Promise<void> {
  const inv = await prisma.feeInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      payments: { where: { deletedAt: null }, select: { amount: true } },
    },
  })
  if (!inv) return
  const paid = inv.payments.reduce((acc, p) => acc + Number(p.amount), 0)
  const status = recomputeInvoiceStatus(Number(inv.amountDue), paid, inv.dueDate)
  await prisma.feeInvoice.update({
    where: { id: invoiceId },
    data: {
      amountPaid: new Prisma.Decimal(paid),
      status,
    },
  })
}
