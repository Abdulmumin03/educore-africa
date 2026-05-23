import { prisma } from "@/lib/db"

const DEFAULT_FINE_PER_DAY = 50 // ₦50/day fallback when not set in School.settings
const DEFAULT_LOAN_DAYS = 14

/**
 * Resolve (or lazily create) the school's main library. Most schools run a
 * single library — we treat the first row as the default and create a "Main
 * Library" stub on demand so callers don't have to deal with library setup.
 */
export async function getDefaultLibrary(schoolId: string): Promise<{ id: string; name: string }> {
  const existing = await prisma.library.findFirst({
    where: { schoolId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  })
  if (existing) return existing
  return prisma.library.create({
    data: { schoolId, name: "Main Library" },
    select: { id: true, name: true },
  })
}

/**
 * Read the school's configured per-day late-return fine (in the school's
 * currency unit). Stored in `School.settings.libraryFinePerDay`.
 */
export async function getFineRate(schoolId: string): Promise<number> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { settings: true },
  })
  const settings = (school?.settings ?? {}) as { libraryFinePerDay?: number }
  const v = settings.libraryFinePerDay
  if (typeof v === "number" && v >= 0 && v <= 100000) return v
  return DEFAULT_FINE_PER_DAY
}

/** Days a book is loaned for by default. Could later be made configurable too. */
export function defaultLoanDays(): number {
  return DEFAULT_LOAN_DAYS
}

/**
 * Compute the fine for a return, given the configured rate. Returns 0 if
 * returned on or before the due date.
 */
export function computeFine(
  dueDate: Date,
  returnedAt: Date,
  finePerDay: number,
): number {
  const ms = returnedAt.getTime() - dueDate.getTime()
  if (ms <= 0) return 0
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
  return Math.max(0, Math.round(days * finePerDay))
}
