import { z } from "zod"

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, "Enter a valid international phone number, e.g. +2348012345678")

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Include at least one uppercase letter")
  .regex(/[a-z]/, "Include at least one lowercase letter")
  .regex(/\d/, "Include at least one number")

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
})
export type LoginInput = z.infer<typeof loginSchema>

export const forgotRequestSchema = z.object({
  email: z.string().email("Enter a valid email"),
})
export type ForgotRequestInput = z.infer<typeof forgotRequestSchema>

export const otpVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
})
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>

export const resetPasswordSchema = z
  .object({
    email: z.string().email(),
    otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

// ── Onboarding wizard ─────────────────────────────────────────────

export const SCHOOL_TYPES = ["PUBLIC", "PRIVATE", "MISSION", "INTERNATIONAL"] as const

export const stepSchoolSchema = z.object({
  schoolName: z.string().trim().min(2, "School name is required"),
  schoolType: z.enum(SCHOOL_TYPES),
  address: z.string().trim().min(3, "Address is required"),
  state: z.string().trim().min(2, "State is required"),
  lga: z.string().trim().min(2, "LGA is required"),
  phone: phoneSchema,
  email: z.string().email("Enter a valid school email"),
  website: z.string().url("Enter a valid URL").or(z.literal("")).optional(),
  logoUrl: z.string().url("Logo upload failed").or(z.literal("")).optional(),
})
export type StepSchoolInput = z.infer<typeof stepSchoolSchema>

export const stepAdminSchema = z
  .object({
    firstName: z.string().trim().min(2, "First name is required"),
    lastName: z.string().trim().min(2, "Last name is required"),
    email: z.string().email("Enter a valid email"),
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  })
export type StepAdminInput = z.infer<typeof stepAdminSchema>

export const SECTIONS = ["NURSERY", "PRIMARY", "JSS", "SSS"] as const
export const stepAcademicSchema = z.object({
  sections: z.array(z.enum(SECTIONS)).min(1, "Select at least one section"),
  armsPerClass: z.number().int().min(1, "At least 1 arm").max(10, "At most 10 arms"),
  sessionName: z.string().regex(/^\d{4}\/\d{4}$/, "Format must be YYYY/YYYY, e.g. 2025/2026"),
})
export type StepAcademicInput = z.infer<typeof stepAcademicSchema>

export const PLANS = ["STARTER", "GROWTH", "PROFESSIONAL", "ENTERPRISE"] as const
export const stepPlanSchema = z.object({
  plan: z.enum(PLANS),
  // Optional, and normalised here so the server never has to guess at case or
  // stray whitespace typed off a flyer.
  promoCode: z
    .string()
    .trim()
    .toUpperCase()
    .max(24)
    .optional()
    .or(z.literal("")),
})
export type StepPlanInput = z.infer<typeof stepPlanSchema>

export const registerSchoolSchema = z.object({
  school: stepSchoolSchema,
  admin: stepAdminSchema,
  academic: stepAcademicSchema,
  plan: stepPlanSchema,
})
export type RegisterSchoolInput = z.infer<typeof registerSchoolSchema>
