import { prisma } from "@/lib/db"

/**
 * Generate a unique admission number in the form `<PREFIX>-YYYY-NNNN`,
 * where PREFIX is the first 3 letters of the school slug (uppercased)
 * and NNNN is a sequential 4-digit counter, scoped per school + year.
 *
 * Idempotent: when called inside a transaction we still reserve a value
 * by looking at existing rows, so concurrent writers may collide; the
 * caller should retry on a unique-constraint violation.
 */
export async function generateAdmissionNumber(opts: {
  schoolId: string
  schoolSlug: string
  year?: number
}): Promise<string> {
  const year = opts.year ?? new Date().getFullYear()
  const prefix = `${opts.schoolSlug.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase() || "SCH"}-${year}-`

  const latest = await prisma.student.findFirst({
    where: {
      schoolId: opts.schoolId,
      admissionNumber: { startsWith: prefix },
    },
    orderBy: { admissionNumber: "desc" },
    select: { admissionNumber: true },
  })

  const lastNumber = latest ? Number(latest.admissionNumber.slice(prefix.length)) || 0 : 0
  const next = String(lastNumber + 1).padStart(4, "0")
  return `${prefix}${next}`
}
