import { z } from "zod"

export const attendanceEntrySchema = z.object({
  studentId: z.string().cuid(),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
  remark: z.string().trim().max(240).optional().or(z.literal("")),
})

export const submitRollCallSchema = z.object({
  classId: z.string().cuid(),
  sectionId: z.string().cuid(),
  date: z.string().min(1), // YYYY-MM-DD
  entries: z.array(attendanceEntrySchema).min(1).max(500),
})

export const qrCheckinSchema = z.object({
  studentId: z.string().cuid(),
  sectionId: z.string().cuid().optional(),
  date: z.string().optional(),
})

export type SubmitRollCallInput = z.infer<typeof submitRollCallSchema>
export type AttendanceEntryInput = z.infer<typeof attendanceEntrySchema>

/**
 * Convert YYYY-MM-DD to UTC midnight for storage in a Date column.
 * Postgres `@db.Date` columns ignore the time portion.
 */
export function dayOnly(date: string | Date): Date {
  const d = typeof date === "string" ? new Date(date) : new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}
