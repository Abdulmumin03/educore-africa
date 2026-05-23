import { prisma } from "@/lib/db"
import {
  gradingSettingsSchema,
  type GradingSettings,
  DEFAULT_GRADING,
} from "@/lib/school-settings"
import type { ExamBodyCode } from "@/lib/curriculum-presets"

export type ResolvedCurriculum = {
  id: string
  schoolId: string
  code: string
  name: string
  examBodyCode: ExamBodyCode
  isDefault: boolean
  gradingScale: GradingSettings
  aiPromptHint: string | null
}

function parseGrading(raw: unknown): GradingSettings {
  const parsed = gradingSettingsSchema.safeParse(raw)
  return parsed.success ? parsed.data : DEFAULT_GRADING
}

function normaliseExamBody(value: string): ExamBodyCode {
  const upper = value.toUpperCase()
  if (upper === "WAEC" || upper === "CAMBRIDGE" || upper === "IB" || upper === "NECO") {
    return upper
  }
  return "NONE"
}

function toResolved(row: {
  id: string
  schoolId: string
  code: string
  name: string
  examBodyCode: string
  isDefault: boolean
  gradingScale: unknown
  aiPromptHint: string | null
}): ResolvedCurriculum {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    name: row.name,
    examBodyCode: normaliseExamBody(row.examBodyCode),
    isDefault: row.isDefault,
    gradingScale: parseGrading(row.gradingScale),
    aiPromptHint: row.aiPromptHint,
  }
}

export async function listCurricula(schoolId: string): Promise<ResolvedCurriculum[]> {
  const rows = await prisma.curriculum.findMany({
    where: { schoolId, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  })
  return rows.map(toResolved)
}

export async function getCurriculumById(
  id: string,
  schoolId: string,
): Promise<ResolvedCurriculum | null> {
  const row = await prisma.curriculum.findFirst({
    where: { id, schoolId, deletedAt: null },
  })
  return row ? toResolved(row) : null
}

export async function getDefaultCurriculum(
  schoolId: string,
): Promise<ResolvedCurriculum | null> {
  const row = await prisma.curriculum.findFirst({
    where: { schoolId, isDefault: true, deletedAt: null },
  })
  return row ? toResolved(row) : null
}

/**
 * Resolve the curriculum that applies to a given class. Falls back to the
 * school's default curriculum if the class has no explicit curriculumId.
 */
export async function resolveCurriculumForClass(
  classId: string,
): Promise<ResolvedCurriculum | null> {
  const klass = await prisma.class.findUnique({
    where: { id: classId },
    select: { schoolId: true, curriculumId: true },
  })
  if (!klass) return null
  if (klass.curriculumId) {
    const row = await prisma.curriculum.findFirst({
      where: { id: klass.curriculumId, deletedAt: null },
    })
    if (row) return toResolved(row)
  }
  return getDefaultCurriculum(klass.schoolId)
}

export { normaliseExamBody }
