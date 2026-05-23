import { prisma } from "@/lib/db"

/**
 * Treat the given Date as a calendar day and return UTC midnight for that
 * day. Used when comparing dates against Term.startDate / Term.endDate, which
 * are persisted at UTC midnight by the registration flow. Local-midnight
 * Dates would skew comparisons by up to one day east of UTC.
 */
function toUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

/**
 * Find the Term whose [startDate, endDate] window contains the given date.
 * Falls back to the school's `isCurrent` term only when no term covers the
 * date — so a stale isCurrent flag (e.g. a school that never advanced from
 * First Term) doesn't tag today's attendance with last September's termId.
 *
 * When two terms overlap (shouldn't happen, but defensive), prefer the one
 * marked isCurrent then the most recent startDate.
 */
export async function findTermForDate(
  schoolId: string,
  date: Date,
): Promise<{ id: string; startDate: Date; endDate: Date } | null> {
  const day = toUtcDay(date)
  const covering = await prisma.term.findFirst({
    where: {
      academicYear: { schoolId },
      deletedAt: null,
      startDate: { lte: day },
      endDate: { gte: day },
    },
    orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
    select: { id: true, startDate: true, endDate: true },
  })
  if (covering) return covering

  return await prisma.term.findFirst({
    where: {
      academicYear: { schoolId },
      deletedAt: null,
      isCurrent: true,
    },
    select: { id: true, startDate: true, endDate: true },
  })
}
