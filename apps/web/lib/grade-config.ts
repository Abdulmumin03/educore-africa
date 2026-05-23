import { prisma } from "@/lib/db"
import { resolveSettings, type GradingSettings } from "@/lib/school-settings"

/**
 * Returns the resolved grading config for a school. Falls back to DEFAULT_GRADING
 * when nothing is set. Computes derived values (caMax + examMax) so callers
 * don't have to.
 */
export async function getGradingConfig(schoolId: string): Promise<
  GradingSettings & {
    caMax: number
    examMax: number
    perComponentMax: number
  }
> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { settings: true },
  })
  const { grading } = resolveSettings(school?.settings ?? null)
  const caMax = grading.caWeight
  const examMax = grading.examWeight
  const perComponentMax = grading.caComponents.length
    ? Math.round((caMax / grading.caComponents.length) * 10) / 10
    : caMax
  return { ...grading, caMax, examMax, perComponentMax }
}

export type ResolvedGradingConfig = Awaited<ReturnType<typeof getGradingConfig>>

/**
 * Look up the letter grade for a 0–100 total. Returns null if the scale has
 * no matching row (shouldn't happen with well-formed defaults).
 */
export function letterGradeFor(
  total: number,
  scale: GradingSettings["scale"],
): { grade: string; remark: string | undefined } | null {
  const row = scale.find((r) => total >= r.minScore && total <= r.maxScore)
  return row ? { grade: row.grade, remark: row.remark } : null
}

/**
 * Compute total CA from a components map. Missing entries treated as 0.
 */
export function totalCaFrom(
  components: Record<string, number> | null | undefined,
  componentNames: string[],
): number {
  if (!components) return 0
  let sum = 0
  for (const k of componentNames) {
    const v = components[k]
    if (typeof v === "number" && Number.isFinite(v)) sum += v
  }
  return Math.round(sum * 10) / 10
}

/**
 * Standard deviation across a number array. Returns 0 for n < 2.
 */
export function stdev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/**
 * Returns true when `score` is more than `threshold` standard deviations away
 * from the mean of `peers`. Used for grade-entry anomaly highlights.
 */
export function isAnomaly(score: number, peers: number[], threshold = 2): boolean {
  if (peers.length < 4) return false
  const mean = peers.reduce((a, b) => a + b, 0) / peers.length
  const sd = stdev(peers)
  if (sd === 0) return false
  return Math.abs(score - mean) > threshold * sd
}

/**
 * Rank students by total descending; equal totals share the same position
 * (competition ranking — Olympic style).
 */
export function computePositions(
  rows: Array<{ studentId: string; totalScore: number }>,
): Map<string, number> {
  const sorted = [...rows].sort((a, b) => b.totalScore - a.totalScore)
  const positions = new Map<string, number>()
  let lastScore: number | null = null
  let lastRank = 0
  sorted.forEach((row, index) => {
    if (lastScore === null || row.totalScore !== lastScore) {
      lastRank = index + 1
      lastScore = row.totalScore
    }
    positions.set(row.studentId, lastRank)
  })
  return positions
}
