import { z } from "zod"

export const personalSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  middleName: z.string().trim().max(60).optional().or(z.literal("")),
  dateOfBirth: z.string(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  admissionNumber: z.string().trim().max(40).optional().or(z.literal("")),
  admissionDate: z.string(),
  photoUrl: z.string().url().optional().or(z.literal("")),
  religion: z.string().trim().max(40).optional().or(z.literal("")),
  bloodGroup: z.string().trim().max(8).optional().or(z.literal("")),
  genotype: z.string().trim().max(8).optional().or(z.literal("")),
  stateOfOrigin: z.string().trim().max(60).optional().or(z.literal("")),
  lga: z.string().trim().max(60).optional().or(z.literal("")),
  nationality: z.string().trim().min(1).max(60),
})

export const academicStepSchema = z.object({
  classId: z.string().min(1, "Class is required"),
  sectionId: z.string().min(1, "Arm is required"),
  academicYearId: z.string().min(1, "Session is required"),
  previousSchool: z.string().max(120).optional().or(z.literal("")),
  previousClass: z.string().max(60).optional().or(z.literal("")),
  reasonForTransfer: z.string().max(300).optional().or(z.literal("")),
  admissionType: z.enum(["NEW", "TRANSFER", "RE_ADMISSION"]),
})

export const guardianSchema = z.object({
  parentId: z.string().optional(), // present when linking an existing parent
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  relationship: z.string().trim().min(1).max(40),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/, "Enter a valid international phone"),
  email: z.string().email().optional().or(z.literal("")),
  occupation: z.string().trim().max(80).optional().or(z.literal("")),
  address: z.string().trim().max(200).optional().or(z.literal("")),
  isPrimary: z.boolean(),
  isEmergencyContact: z.boolean(),
  canPickup: z.boolean(),
})

export const guardiansStepSchema = z
  .array(guardianSchema)
  .min(1, "At least one guardian is required")
  .max(3, "At most 3 guardians")

export const healthStepSchema = z.object({
  knownAllergies: z.string().max(300).optional().or(z.literal("")),
  disabilities: z.string().max(300).optional().or(z.literal("")),
  specialNeeds: z.string().max(300).optional().or(z.literal("")),
  doctorName: z.string().max(80).optional().or(z.literal("")),
  doctorPhone: z.string().max(30).optional().or(z.literal("")),
  medicalInsurance: z.string().max(80).optional().or(z.literal("")),
  emergencyMedicalConsent: z.boolean(),
})

export const registerStudentSchema = z.object({
  personal: personalSchema,
  academic: academicStepSchema,
  guardians: guardiansStepSchema,
  health: healthStepSchema,
})

export type PersonalInput = z.infer<typeof personalSchema>
export type AcademicStepInput = z.infer<typeof academicStepSchema>
export type GuardianInput = z.infer<typeof guardianSchema>
export type HealthStepInput = z.infer<typeof healthStepSchema>
export type RegisterStudentInput = z.infer<typeof registerStudentSchema>

// ── Sub-resource schemas ────────────────────────────────────────

export const healthEntrySchema = z.object({
  date: z.string(),
  description: z.string().trim().min(2).max(500),
  actionTaken: z.string().max(500).optional(),
})

export const behaviorLogSchema = z.object({
  date: z.string(),
  severity: z.enum(["MINOR", "MODERATE", "SEVERE"]),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(1000),
  actionTaken: z.string().max(500).optional(),
  counselorNotes: z.string().max(1000).optional(),
})

export const documentSchema = z.object({
  kind: z.enum([
    "birth_certificate",
    "report_card",
    "waec_result",
    "admission_letter",
    "medical_form",
    "other",
  ]),
  label: z.string().max(120).optional(),
  url: z.string().url(),
  fileSize: z.number().int().nonnegative().optional(),
})
