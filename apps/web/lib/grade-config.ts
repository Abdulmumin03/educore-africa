import { prisma } from "@/lib/db"
import { gradingSettingsSchema, DEFAULT_GRADING, type GradingSettings } from "@/lib/school-settings"

type GradingConfigInput =
  | string
  | {
      schoolId: string
      classId?: string | null
      sectionId?: string | null
      curriculumId?: string | null
    }

/**
 * Returns the resolved grading config for a school + class context.
 *
 * Resolution order:
 *   1. explicit curriculumId (if provided)
 *   2. class.curriculumId (resolved from classId or sectionId)
 *   3. school's default Curriculum
 *   4. DEFAULT_GRADING (WAEC scale) — last-resort if a school has no curricula
 *
 * Legacy callers passing just a schoolId still work — they get the school's
 * default curriculum (which the P14 migration backfilled for every school).
 */
export async function getGradingConfig(input: GradingConfigInput): Promise<
  GradingSettings & {
    caMax: number
    examMax: number
    perComponentMax: number
    curriculumId: string | null
  }
> {
  const opts: Exclude<GradingConfigInput, string> =
    typeof input === "string" ? { schoolId: input } : input

  let curriculumId = opts.curriculumId ?? null

  if (!curriculumId && opts.classId) {
    const klass = await prisma.class.findUnique({
      where: { id: opts.classId },
      select: { curriculumId: true },
    })
    curriculumId = klass?.curriculumId ?? null
  }

  if (!curriculumId && opts.sectionId) {
    const section = await prisma.section.findUnique({
      where: { id: opts.sectionId },
      select: { class: { select: { curriculumId: true } } },
    })
    curriculumId = section?.class.curriculumId ?? null
  }

  let grading: GradingSettings | null = null

  if (curriculumId) {
    const cur = await prisma.curriculum.findFirst({
      where: { id: curriculumId, schoolId: opts.schoolId, deletedAt: null },
      select: { gradingScale: true },
    })
    if (cur) {
      const parsed = gradingSettingsSchema.safeParse(cur.gradingScale)
      if (parsed.success) grading = parsed.data
    }
  }

  if (!grading) {
    // Fall back to the school's default curriculum.
    const def = await prisma.curriculum.findFirst({
      where: { schoolId: opts.schoolId, isDefault: true, deletedAt: null },
      select: { id: true, gradingScale: true },
    })
    if (def) {
      const parsed = gradingSettingsSchema.safeParse(def.gradingScale)
      if (parsed.success) {
        grading = parsed.data
        curriculumId = curriculumId ?? def.id
      }
    }
  }

  if (!grading) {
    // Last-resort default — only hit when a school somehow has no curricula.
    grading = DEFAULT_GRADING
  }

  const caMax = grading.caWeight
  const examMax = grading.examWeight
  const perComponentMax = grading.caComponents.length
    ? Math.round((caMax / grading.caComponents.length) * 10) / 10
    : caMax
  return { ...grading, caMax, examMax, perComponentMax, curriculumId }
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
