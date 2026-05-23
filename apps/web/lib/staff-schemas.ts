import { z } from "zod"

// ─── Registration (5-tab wizard) ──────────────────────────────────

export const staffPersonalSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  middleName: z.string().trim().max(80).optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  dateOfBirth: z.string().min(1), // YYYY-MM-DD
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().email(),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  stateOfOrigin: z.string().trim().max(80).optional().or(z.literal("")),
  nin: z.string().trim().regex(/^\d{0,11}$/, "NIN must be up to 11 digits").optional().or(z.literal("")),
  bvn: z.string().trim().regex(/^\d{0,11}$/, "BVN must be up to 11 digits").optional().or(z.literal("")),
  photoUrl: z.string().url().optional().or(z.literal("")),
})

export const staffEmploymentSchema = z.object({
  staffNumber: z.string().trim().max(40).optional().or(z.literal("")), // auto-generated if empty
  staffType: z.enum(["TEACHING", "NON_TEACHING", "ADMIN", "CONTRACT", "NYSC"]),
  role: z.enum([
    "TEACHER",
    "PRINCIPAL",
    "BURSAR",
    "COUNSELOR",
    "LIBRARIAN",
    "HOSTEL_MASTER",
    "DRIVER",
    "SCHOOL_ADMIN",
  ]),
  hireDate: z.string().min(1),
  department: z.string().trim().max(80).optional().or(z.literal("")),
  qualification: z.string().trim().max(160).optional().or(z.literal("")),
  experienceYears: z.number().int().min(0).max(60),
})

export const staffSubjectsClassesSchema = z.object({
  subjectIds: z.array(z.string().cuid()).default([]),
  sectionIds: z.array(z.string().cuid()).default([]),
  academicYearId: z.string().cuid().optional(),
})

const moneyLine = z.object({
  name: z.string().trim().min(1).max(80),
  amount: z.coerce.number().min(0),
})

export const staffSalarySchema = z.object({
  gradeLevel: z.string().trim().max(40).optional().or(z.literal("")),
  basicSalary: z.coerce.number().min(0).optional(),
  allowances: z.array(moneyLine).default([]),
  deductions: z.array(moneyLine).default([]),
  bankName: z.string().trim().max(80).optional().or(z.literal("")),
  accountNumber: z.string().trim().max(20).optional().or(z.literal("")),
  accountName: z.string().trim().max(120).optional().or(z.literal("")),
})

export const staffDocumentSchema = z.object({
  kind: z.string().trim().min(1).max(40), // OFFER_LETTER, CERTIFICATE, ID, OTHER
  label: z.string().trim().max(120).optional().or(z.literal("")),
  url: z.string().url(),
})

export const registerStaffSchema = z.object({
  personal: staffPersonalSchema,
  employment: staffEmploymentSchema,
  assignments: staffSubjectsClassesSchema,
  salary: staffSalarySchema,
  documents: z.array(staffDocumentSchema).default([]),
})

export type RegisterStaffInput = z.infer<typeof registerStaffSchema>
export type StaffPersonalInput = z.infer<typeof staffPersonalSchema>
export type StaffEmploymentInput = z.infer<typeof staffEmploymentSchema>
export type StaffAssignmentsInput = z.infer<typeof staffSubjectsClassesSchema>
export type StaffSalaryInput = z.infer<typeof staffSalarySchema>
export type StaffDocumentInput = z.infer<typeof staffDocumentSchema>

// ─── Update (PUT /api/staff/[id]) ─────────────────────────────────

export const updateStaffSchema = z.object({
  middleName: z.string().trim().max(80).nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  stateOfOrigin: z.string().trim().max(80).nullable().optional(),
  nin: z.string().trim().max(11).nullable().optional(),
  bvn: z.string().trim().max(11).nullable().optional(),
  staffType: z.enum(["TEACHING", "NON_TEACHING", "ADMIN", "CONTRACT", "NYSC"]).optional(),
  status: z
    .enum(["ACTIVE", "ON_LEAVE", "SUSPENDED", "RESIGNED", "TERMINATED", "RETIRED"])
    .optional(),
  department: z.string().trim().max(80).nullable().optional(),
  qualification: z.string().trim().max(160).nullable().optional(),
  experienceYears: z.coerce.number().int().min(0).max(60).optional(),
  gradeLevel: z.string().trim().max(40).nullable().optional(),
  basicSalary: z.coerce.number().min(0).nullable().optional(),
  allowances: z.array(moneyLine).nullable().optional(),
  deductions: z.array(moneyLine).nullable().optional(),
  bankName: z.string().trim().max(80).nullable().optional(),
  accountNumber: z.string().trim().max(20).nullable().optional(),
  accountName: z.string().trim().max(120).nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
})
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>

// ─── Leave ────────────────────────────────────────────────────────

export const applyLeaveSchema = z
  .object({
    leaveType: z.enum([
      "ANNUAL",
      "SICK",
      "MATERNITY",
      "PATERNITY",
      "EMERGENCY",
      "STUDY",
      "UNPAID",
    ]),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    reason: z.string().trim().min(2).max(2000),
    attachmentUrl: z.string().url().optional().or(z.literal("")),
  })
  .refine(
    (v) => new Date(v.endDate).getTime() >= new Date(v.startDate).getTime(),
    { message: "endDate must be on or after startDate", path: ["endDate"] },
  )

export const reviewLeaveSchema = z
  .object({
    action: z.enum(["APPROVE", "REJECT", "CANCEL"]),
    reviewerComment: z.string().trim().max(1000).optional().or(z.literal("")),
    substituteStaffId: z.string().cuid().optional().or(z.literal("")),
  })
  .refine((v) => v.action !== "APPROVE" || true, { message: "" })

export type ApplyLeaveInput = z.infer<typeof applyLeaveSchema>
export type ReviewLeaveInput = z.infer<typeof reviewLeaveSchema>

// ─── Evaluation ───────────────────────────────────────────────────

export const evaluationInputSchema = z.object({
  termId: z.string().cuid(),
  passRate: z.number().min(0).max(1).nullable().optional(),
  attendanceRate: z.number().min(0).max(1).nullable().optional(),
  lessonPlanRate: z.number().min(0).max(1).nullable().optional(),
  parentScore: z.number().min(1).max(5).nullable().optional(),
  principalComment: z.string().trim().max(4000).optional().or(z.literal("")),
  status: z.enum(["DRAFT", "FINAL"]).default("DRAFT"),
  aiSummary: z.string().trim().max(4000).optional().or(z.literal("")),
  aiModel: z.string().trim().max(80).optional().or(z.literal("")),
})
export type EvaluationInput = z.infer<typeof evaluationInputSchema>

// Weighted final score used by both the API and the appraisal endpoint.
// Weights chosen to align with the spec:
//   pass rate 40, attendance 20, lesson plans 20, parent feedback 20.
export function computeEvaluation(scores: {
  passRate?: number | null
  attendanceRate?: number | null
  lessonPlanRate?: number | null
  parentScore?: number | null
}): { finalScore: number | null; badge: string | null } {
  let total = 0
  let weight = 0
  if (scores.passRate != null) {
    total += scores.passRate * 40
    weight += 40
  }
  if (scores.attendanceRate != null) {
    total += scores.attendanceRate * 20
    weight += 20
  }
  if (scores.lessonPlanRate != null) {
    total += scores.lessonPlanRate * 20
    weight += 20
  }
  if (scores.parentScore != null) {
    total += (scores.parentScore / 5) * 20
    weight += 20
  }
  if (weight === 0) return { finalScore: null, badge: null }
  const normalized = Math.round((total / weight) * 100)
  let badge: string
  if (normalized >= 85) badge = "OUTSTANDING"
  else if (normalized >= 70) badge = "MEETS_EXPECTATIONS"
  else if (normalized >= 55) badge = "NEEDS_IMPROVEMENT"
  else badge = "UNSATISFACTORY"
  return { finalScore: normalized, badge }
}
