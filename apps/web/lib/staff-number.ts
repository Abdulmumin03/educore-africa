import { prisma } from "@/lib/db"

/**
 * Generate a unique staff number in the form `<PREFIX>-STF-NNNN`, where PREFIX
 * is the first 3 alphanumeric chars of the school slug (uppercased). Scoped per
 * school; the caller should retry on a unique-constraint collision.
 */
export async function generateStaffNumber(opts: {
  schoolId: string
  schoolSlug: string
}): Promise<string> {
  const prefix = `${opts.schoolSlug.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase() || "SCH"}-STF-`

  const latest = await prisma.staff.findFirst({
    where: {
      schoolId: opts.schoolId,
      staffNumber: { startsWith: prefix },
    },
    orderBy: { staffNumber: "desc" },
    select: { staffNumber: true },
  })
  const lastNumber = latest ? Number(latest.staffNumber.slice(prefix.length)) || 0 : 0
  return `${prefix}${String(lastNumber + 1).padStart(4, "0")}`
}
