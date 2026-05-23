import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { resolveFinanceAccess } from "@/lib/finance-access"
import { generateInvoicesSchema } from "@/lib/finance-schemas"
import { generateInvoiceNumber, pickStudentDiscount, recomputeInvoiceStatus } from "@/lib/finance"
import { sendSms } from "@/lib/sms"
import { sendEmail } from "@/lib/email"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Bulk-create FeeInvoice rows for every active student in the chosen classes
 * for the given term. Idempotent — skips students who already have an invoice
 * for that term (unique constraint on studentId+termId). Applies any active
 * auto-discounts (sibling) + awarded discounts.
 *
 * When `notify=true`, sends an SMS + email to the primary guardian per invoice.
 */
export async function POST(req: Request) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = generateInvoicesSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { termId, classIds, dueDate, notify } = parsed.data

  const [term, school] = await Promise.all([
    prisma.term.findFirst({
      where: { id: termId, academicYear: { schoolId: access.session.schoolId } },
      include: { academicYear: { select: { id: true, name: true } } },
    }),
    prisma.school.findUnique({
      where: { id: access.session.schoolId },
      select: { id: true, slug: true, name: true },
    }),
  ])
  if (!term || !school) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const due = new Date(dueDate)

  // Pull fee structures for each requested class. Prefer term-scoped over
  // year-scoped; if both exist for a class, term-scoped wins (merge approach
  // below would double-bill so we just override).
  const structures = await prisma.feeStructure.findMany({
    where: {
      schoolId: access.session.schoolId,
      academicYearId: term.academicYear.id,
      classId: { in: classIds },
      OR: [{ termId }, { termId: null }],
      deletedAt: null,
    },
  })

  const byClass = new Map<
    string,
    {
      termScoped: typeof structures
      yearScoped: typeof structures
    }
  >()
  for (const s of structures) {
    if (!byClass.has(s.classId)) byClass.set(s.classId, { termScoped: [], yearScoped: [] })
    const bucket = byClass.get(s.classId)!
    if (s.termId === termId) bucket.termScoped.push(s)
    else bucket.yearScoped.push(s)
  }

  // Active enrollments for these classes.
  const enrollments = await prisma.enrollment.findMany({
    where: {
      schoolId: access.session.schoolId,
      isActive: true,
      deletedAt: null,
      student: { status: "ACTIVE", deletedAt: null },
      section: { classId: { in: classIds } },
    },
    include: {
      student: {
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
          parents: {
            where: { isPrimary: true },
            include: { parent: { include: { user: { select: { phone: true, email: true } } } } },
          },
        },
      },
      section: { select: { classId: true, name: true, class: { select: { name: true } } } },
    },
  })

  let created = 0
  let skipped = 0
  const errors: Array<{ studentId: string; reason: string }> = []

  for (const enrollment of enrollments) {
    try {
      const bucket = byClass.get(enrollment.section.classId)
      if (!bucket) {
        errors.push({ studentId: enrollment.student.id, reason: "No fee structure for class" })
        continue
      }
      const components = bucket.termScoped.length > 0 ? bucket.termScoped : bucket.yearScoped
      if (components.length === 0) {
        errors.push({ studentId: enrollment.student.id, reason: "No fee components for class" })
        continue
      }

      // Skip if invoice already exists for this (student, term) — idempotent re-run.
      const existing = await prisma.feeInvoice.findFirst({
        where: { studentId: enrollment.student.id, termId, deletedAt: null },
        select: { id: true },
      })
      if (existing) {
        skipped += 1
        continue
      }

      const items = components.map((c) => ({
        name: c.name,
        category: c.category,
        amount: Number(c.amount),
        isMandatory: c.isMandatory,
        dueDate: c.dueDate?.toISOString() ?? null,
      }))
      const subtotal = items.reduce((acc, it) => (it.isMandatory ? acc + it.amount : acc), 0)
      const discount = await pickStudentDiscount({
        schoolId: access.session.schoolId,
        studentId: enrollment.student.id,
        subtotal,
      })
      const discountAmount = discount?.amount ?? 0
      const amountDue = Math.max(0, subtotal - discountAmount)
      const status = recomputeInvoiceStatus(amountDue, 0, due)

      const invoiceNo = await generateInvoiceNumber({
        schoolId: school.id,
        schoolSlug: school.slug,
      })

      const invoice = await prisma.feeInvoice.create({
        data: {
          schoolId: access.session.schoolId,
          studentId: enrollment.student.id,
          termId,
          invoiceNo,
          items,
          subtotal: new Prisma.Decimal(subtotal),
          discountAmount: new Prisma.Decimal(discountAmount),
          discountReason: discount?.reason ?? null,
          amountDue: new Prisma.Decimal(amountDue),
          dueDate: due,
          status,
        },
        select: { id: true, invoiceNo: true },
      })
      created += 1

      if (notify) {
        const studentName = `${enrollment.student.user.firstName} ${enrollment.student.user.lastName}`
        const primary = enrollment.student.parents[0]?.parent
        const message =
          `${school.name}: invoice ${invoice.invoiceNo} for ${studentName} (` +
          `${term.academicYear.name} ${term.type.toLowerCase()} term). Amount: NGN ${amountDue.toLocaleString()}, ` +
          `due ${due.toISOString().slice(0, 10)}.`
        if (primary?.user.phone) {
          void sendSms(primary.user.phone, message)
        }
        if (primary?.user.email) {
          void sendEmail({
            to: primary.user.email,
            subject: `Invoice ${invoice.invoiceNo} — ${studentName}`,
            html: `<p>${message}</p>`,
            text: message,
          })
        }
      }
    } catch (err) {
      errors.push({
        studentId: enrollment.student.id,
        reason: err instanceof Error ? err.message : "Unknown",
      })
    }
  }

  return NextResponse.json({
    ok: true,
    created,
    skipped,
    errors,
    total: enrollments.length,
  })
}
