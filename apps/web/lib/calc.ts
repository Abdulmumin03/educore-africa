/**
 * Tiny pure-function calc helpers used across attendance / finance / grades.
 * They exist as their own file so unit tests can import them without dragging
 * Prisma or Redis into the test runner.
 */

/**
 * CA + exam → rounded total. Both inputs are clamped to >= 0 to mirror what
 * the grade-entry routes already do server-side.
 */
export function computeTotalScore(ca: number, exam: number): number {
  const safe = Math.max(0, ca) + Math.max(0, exam)
  return Math.round(safe * 10) / 10
}

/**
 * Attendance % from present/total. Returns null when `total` is 0 so callers
 * can render "—" instead of "0%" (no data ≠ everyone absent).
 */
export function attendancePct(present: number, total: number): number | null {
  if (total <= 0) return null
  if (present < 0) return 0
  if (present > total) return 100
  return Math.round((present / total) * 100)
}

/**
 * Outstanding fees = max(0, billed − paid). Negative overpayments are
 * clamped to 0; the credit balance lives on the invoice row.
 */
export function outstandingBalance(billed: number, paid: number): number {
  const out = billed - paid
  return out > 0 ? out : 0
}
