import { z } from "zod"

// One row of CA components, e.g. { CA1: 8, CA2: 7, "Mid-Term": 12, Assignment: 9 }
export const caComponentsSchema = z.record(z.string(), z.number().min(0).max(100))

// PATCH a single grade cell (auto-save on blur)
export const patchGradeSchema = z.object({
  caComponents: caComponentsSchema.optional(),
  examScore: z.number().min(0).max(100).optional(),
  teacherRemark: z.string().trim().max(2000).optional().or(z.literal("")),
})

// Bulk upsert — used by both the spreadsheet "save all" and the CSV import.
export const bulkGradeEntrySchema = z.object({
  studentId: z.string().cuid(),
  caComponents: caComponentsSchema.optional(),
  examScore: z.number().min(0).max(100).optional(),
  teacherRemark: z.string().trim().max(2000).optional().or(z.literal("")),
})

export const bulkGradesSchema = z.object({
  classId: z.string().cuid(),
  sectionId: z.string().cuid().optional(),
  termId: z.string().cuid(),
  subjectId: z.string().cuid(),
  entries: z.array(bulkGradeEntrySchema).min(1).max(500),
})

// CSV row preview — values are still strings at this stage so the importer
// can surface per-cell errors before parsing.
export const csvRowSchema = z.object({
  admissionNumber: z.string().trim().min(1),
  components: z.record(z.string(), z.string()).optional(),
  exam: z.string().optional(),
})

export const generateReportCardSchema = z.object({
  classId: z.string().cuid(),
  sectionId: z.string().cuid().optional(),
  termId: z.string().cuid(),
  withAiRemarks: z.boolean().default(true),
  withAiPrincipal: z.boolean().default(true),
})

export const shareReportCardSchema = z.object({
  reportCardId: z.string().cuid(),
  expiresInDays: z.number().int().min(1).max(90).default(30),
  sendSms: z.boolean().default(false),
})

export const aiRemarkSchema = z.object({
  studentName: z.string().min(1).max(120),
  subject: z.string().min(1).max(80),
  score: z.number().min(0).max(100),
  classAverage: z.number().min(0).max(100).optional(),
  trend: z.enum(["up", "down", "stable"]).optional(),
  letterGrade: z.string().min(1).max(4).optional(),
})

export const aiPrincipalSchema = z.object({
  studentName: z.string().min(1).max(120),
  className: z.string().min(1).max(40),
  average: z.number().min(0).max(100),
  position: z.number().int().min(0).optional(),
  positionOutOf: z.number().int().min(1).optional(),
  attendancePct: z.number().min(0).max(100).optional(),
  subjects: z
    .array(
      z.object({
        name: z.string(),
        score: z.number(),
        letterGrade: z.string().optional(),
      }),
    )
    .max(20),
})

export const generateMidtermReportSchema = z.object({
  classId: z.string().cuid(),
  sectionId: z.string().cuid().optional(),
  termId: z.string().cuid(),
})

export const patchMidtermReportSchema = z
  .object({
    termId: z.string().cuid(),
    classTeacherComment: z.string().trim().max(2000).nullable().optional(),
    principalComment: z.string().trim().max(2000).nullable().optional(),
  })
  .refine(
    (v) =>
      v.classTeacherComment !== undefined || v.principalComment !== undefined,
    { message: "Nothing to update" },
  )

export const shareMidtermReportSchema = z.object({
  studentId: z.string().cuid(),
  termId: z.string().cuid(),
  expiresInDays: z.number().int().min(1).max(60).default(14),
  sendSms: z.boolean().default(false),
})

export type PatchGradeInput = z.infer<typeof patchGradeSchema>
export type BulkGradesInput = z.infer<typeof bulkGradesSchema>
export type GenerateReportCardInput = z.infer<typeof generateReportCardSchema>
export type GenerateMidtermReportInput = z.infer<typeof generateMidtermReportSchema>
export type PatchMidtermReportInput = z.infer<typeof patchMidtermReportSchema>
export type ShareMidtermReportInput = z.infer<typeof shareMidtermReportSchema>
export type ShareReportCardInput = z.infer<typeof shareReportCardSchema>
export type AiRemarkInput = z.infer<typeof aiRemarkSchema>
export type AiPrincipalInput = z.infer<typeof aiPrincipalSchema>
