import { z } from "zod"

const feeCategoryEnum = z.enum([
  "TUITION",
  "LEVY",
  "UNIFORM",
  "BOOKS",
  "TRANSPORT",
  "HOSTEL",
  "EXAM",
  "PTA",
  "OTHER",
])

export const feeComponentSchema = z.object({
  id: z.string().cuid().optional(), // present for updates
  name: z.string().trim().min(2).max(80),
  category: feeCategoryEnum.default("OTHER"),
  amount: z.number().min(0).max(10_000_000),
  isMandatory: z.boolean().default(true),
  dueDate: z.string().optional().or(z.literal("")),
})

export const upsertFeeStructureSchema = z.object({
  academicYearId: z.string().cuid(),
  termId: z.string().cuid().nullable().optional(),
  classId: z.string().cuid(),
  components: z.array(feeComponentSchema).min(1).max(40),
})

export const copyFeeStructureSchema = z.object({
  fromAcademicYearId: z.string().cuid(),
  fromTermId: z.string().cuid().nullable().optional(),
  fromClassId: z.string().cuid(),
  toAcademicYearId: z.string().cuid(),
  toTermId: z.string().cuid().nullable().optional(),
  toClassId: z.string().cuid(),
  adjustPercent: z.number().min(-100).max(500).optional(), // e.g. 10 = increase by 10%
})

export const generateInvoicesSchema = z.object({
  termId: z.string().cuid(),
  classIds: z.array(z.string().cuid()).min(1).max(40),
  dueDate: z.string().min(1),
  notify: z.boolean().default(false),
})

export const recordPaymentSchema = z.object({
  invoiceId: z.string().cuid(),
  amount: z.number().min(1).max(10_000_000),
  paidAt: z.string().optional(),
  channel: z.enum(["CASH", "BANK_TRANSFER", "POS", "CHEQUE", "USSD", "MOBILE_MONEY"]),
  reference: z.string().trim().max(80).optional().or(z.literal("")),
  payerName: z.string().trim().max(120).optional().or(z.literal("")),
  payerPhone: z.string().trim().max(20).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  evidenceUrl: z.string().url().optional().or(z.literal("")),
})

export const initializePaystackSchema = z.object({
  invoiceId: z.string().cuid(),
  amount: z.number().min(1).optional(), // defaults to invoice balance
  email: z.string().email().optional(), // defaults to parent / school email
  callbackUrl: z.string().url().optional(),
})

export const remindDebtorsSchema = z.object({
  invoiceIds: z.array(z.string().cuid()).min(1).max(500),
  channels: z.array(z.enum(["SMS", "EMAIL"])).min(1).default(["SMS"]),
  message: z.string().trim().max(280).optional().or(z.literal("")),
})

export const paymentRiskSchema = z.object({
  termId: z.string().cuid(),
  classId: z.string().cuid().optional(),
})

export const upsertDiscountSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(["SIBLING", "STAFF_CHILD", "SCHOLARSHIP", "NEED_BASED", "MANUAL"]),
  percent: z.number().min(0).max(100).nullable().optional(),
  fixedAmount: z.number().min(0).max(10_000_000).nullable().optional(),
  requiresApproval: z.boolean().default(false),
  autoApply: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

export const awardDiscountSchema = z.object({
  studentId: z.string().cuid(),
  discountId: z.string().cuid(),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
})

export type FeeComponentInput = z.infer<typeof feeComponentSchema>
export type UpsertFeeStructureInput = z.infer<typeof upsertFeeStructureSchema>
export type GenerateInvoicesInput = z.infer<typeof generateInvoicesSchema>
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>
export type RemindDebtorsInput = z.infer<typeof remindDebtorsSchema>
