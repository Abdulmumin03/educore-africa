import { z } from "zod"

// Everything that lives inside the School.settings JSON column.
// Grading config has moved to the Curriculum model (P14); settings now only
// covers notifications.

export const gradeRowSchema = z.object({
  grade: z.string().min(1).max(4),
  minScore: z.number().int().min(0).max(100),
  maxScore: z.number().int().min(0).max(100),
  points: z.number().min(0).max(10),
  remark: z.string().max(40).optional(),
})

export const gradingSettingsSchema = z.object({
  scale: z.array(gradeRowSchema).max(20),
  caWeight: z.number().int().min(0).max(100),
  examWeight: z.number().int().min(0).max(100),
  caComponents: z.array(z.string().min(1).max(40)).max(10),
  positionRanking: z.boolean(),
})

export const notificationSettingsSchema = z.object({
  channels: z.object({
    sms: z.boolean(),
    email: z.boolean(),
    whatsapp: z.boolean(),
    push: z.boolean(),
  }),
  events: z.object({
    paymentReceived: z.boolean(),
    feeReminder: z.boolean(),
    attendanceAbsent: z.boolean(),
    gradePublished: z.boolean(),
    announcement: z.boolean(),
  }),
  whatsapp: z
    .object({
      phoneNumberId: z.string().optional(),
      configured: z.boolean(),
    })
    .optional(),
})

export const schoolSettingsSchema = z
  .object({
    notifications: notificationSettingsSchema.optional(),
  })
  .strict()

export type GradingSettings = z.infer<typeof gradingSettingsSchema>
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>
export type SchoolSettings = z.infer<typeof schoolSettingsSchema>

// Default WAEC scale — preserved as a constant for the curriculum-presets
// module to seed from, and as a last-resort fallback inside grade-config when
// a school has zero curricula configured.
export const DEFAULT_GRADING: GradingSettings = {
  scale: [
    { grade: "A1", minScore: 75, maxScore: 100, points: 4.0, remark: "Excellent" },
    { grade: "B2", minScore: 70, maxScore: 74, points: 3.5, remark: "Very good" },
    { grade: "B3", minScore: 65, maxScore: 69, points: 3.0, remark: "Good" },
    { grade: "C4", minScore: 60, maxScore: 64, points: 2.5, remark: "Credit" },
    { grade: "C5", minScore: 55, maxScore: 59, points: 2.0, remark: "Credit" },
    { grade: "C6", minScore: 50, maxScore: 54, points: 1.5, remark: "Credit" },
    { grade: "D7", minScore: 45, maxScore: 49, points: 1.0, remark: "Pass" },
    { grade: "E8", minScore: 40, maxScore: 44, points: 0.5, remark: "Pass" },
    { grade: "F9", minScore: 0, maxScore: 39, points: 0.0, remark: "Fail" },
  ],
  caWeight: 40,
  examWeight: 60,
  caComponents: ["CA1", "CA2", "Mid-Term", "Assignment"],
  positionRanking: true,
}

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  channels: { sms: true, email: true, whatsapp: false, push: false },
  events: {
    paymentReceived: true,
    feeReminder: true,
    attendanceAbsent: true,
    gradePublished: false,
    announcement: true,
  },
}

export function resolveSettings(raw: unknown): {
  notifications: NotificationSettings
} {
  const parsed = schoolSettingsSchema.safeParse(raw ?? {})
  const data = parsed.success ? parsed.data : {}
  return {
    notifications: data.notifications ?? DEFAULT_NOTIFICATIONS,
  }
}
