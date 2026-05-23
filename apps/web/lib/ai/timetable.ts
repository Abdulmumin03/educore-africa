import { z } from "zod"
import { generateJson, FAST_MODEL } from "@/lib/ai"

export const timetableInputSchema = z.object({
  schoolHours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/), // 24h, "08:00"
    end: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  periodsPerDay: z.number().int().min(1).max(12),
  periodDurationMins: z.number().int().min(20).max(120),
  breaks: z
    .array(
      z.object({
        afterPeriod: z.number().int().min(1).max(12),
        durationMins: z.number().int().min(5).max(120),
        label: z.string().max(40).optional(),
      }),
    )
    .max(5),
  daysPerWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  classes: z
    .array(
      z.object({
        classId: z.string().cuid(),
        sectionId: z.string().cuid(),
        label: z.string(), // human-readable e.g. "JSS 2 · Arm A"
        subjects: z
          .array(
            z.object({
              subjectId: z.string().cuid(),
              subjectName: z.string(),
              periodsPerWeek: z.number().int().min(1).max(20),
              preferredTeacherId: z.string().cuid().optional(),
            }),
          )
          .min(1),
      }),
    )
    .min(1)
    .max(40),
  teachers: z.array(
    z.object({
      teacherId: z.string().cuid(),
      name: z.string(),
      unavailable: z
        .array(z.object({ day: z.number().int().min(0).max(6), period: z.number().int().min(1) }))
        .optional(),
    }),
  ),
  rooms: z.array(z.string()).max(50).optional(),
})

export type TimetableInput = z.infer<typeof timetableInputSchema>

export const timetableSlotSchema = z.object({
  classId: z.string(),
  sectionId: z.string(),
  day: z.number().int().min(0).max(6),
  period: z.number().int().min(1).max(12),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  subjectId: z.string(),
  teacherId: z.string(),
  room: z.string().nullable().optional(),
})

export type TimetableSlot = z.infer<typeof timetableSlotSchema>

export const timetableOutputSchema = z.object({
  slots: z.array(timetableSlotSchema),
})

const SYSTEM_PROMPT = `You generate a weekly Nigerian K-12 school timetable.

You will receive constraints as JSON: school hours, period count + duration, breaks, days per week, classes (with section + required subjects + periods/week), teacher availability, and optional rooms.

Compute the period start/end times from schoolHours.start + periodDurationMins, skipping the listed breaks. Then assign subjects-to-periods for each (class, section) such that:
  • Each class gets exactly the requested periods/week per subject.
  • A teacher is NEVER double-booked across classes at the same (day, period).
  • Teachers are NEVER scheduled during their listed unavailable slots.
  • Prefer the preferredTeacherId for each subject when provided.
  • Spread the same subject across the week (avoid clustering) when possible.

Return STRICT JSON, no markdown:
{"slots":[{"classId","sectionId","day","period","startTime","endTime","subjectId","teacherId","room":null}]}

Use the exact IDs from the input. day is 0=Sunday..6=Saturday. period starts at 1.
If a constraint is impossible to satisfy, return your best effort and note in a "warnings" field at the top level.`

export async function generateTimetable(
  input: TimetableInput,
): Promise<
  | { ok: true; slots: TimetableSlot[]; model: string; warnings: string[]; conflicts: TimetableConflict[] }
  | { ok: false; error: string }
> {
  const result = await generateJson<{ slots: TimetableSlot[]; warnings?: string[] }>({
    system: SYSTEM_PROMPT,
    user: JSON.stringify(input),
    model: FAST_MODEL,
    maxTokens: 4000,
  })
  if (!result.ok) return { ok: false, error: result.error }

  const parsed = z
    .object({ slots: z.array(timetableSlotSchema), warnings: z.array(z.string()).optional() })
    .safeParse(result.data)
  if (!parsed.success) {
    return { ok: false, error: "AI returned malformed slot data" }
  }

  return {
    ok: true,
    slots: parsed.data.slots,
    warnings: parsed.data.warnings ?? [],
    conflicts: detectConflicts(parsed.data.slots, input),
    model: result.model,
  }
}

export type TimetableConflict =
  | { type: "teacher-double-booked"; teacherId: string; day: number; period: number; slots: TimetableSlot[] }
  | { type: "teacher-unavailable"; teacherId: string; day: number; period: number; slot: TimetableSlot }
  | { type: "subject-shortfall"; classId: string; subjectId: string; required: number; got: number }

export function detectConflicts(slots: TimetableSlot[], input: TimetableInput): TimetableConflict[] {
  const conflicts: TimetableConflict[] = []
  // Teacher double-booking.
  const teacherSlots = new Map<string, TimetableSlot[]>()
  for (const s of slots) {
    const key = `${s.teacherId}-${s.day}-${s.period}`
    if (!teacherSlots.has(key)) teacherSlots.set(key, [])
    teacherSlots.get(key)!.push(s)
  }
  teacherSlots.forEach((group, key) => {
    if (group.length < 2) return
    const [teacherId, dayStr, periodStr] = key.split("-")
    conflicts.push({
      type: "teacher-double-booked",
      teacherId,
      day: Number(dayStr),
      period: Number(periodStr),
      slots: group,
    })
  })

  // Teacher unavailability violations.
  const unavailable = new Map<string, Set<string>>()
  for (const t of input.teachers ?? []) {
    if (!t.unavailable) continue
    const set = new Set<string>()
    for (const u of t.unavailable) set.add(`${u.day}-${u.period}`)
    unavailable.set(t.teacherId, set)
  }
  for (const s of slots) {
    const set = unavailable.get(s.teacherId)
    if (set?.has(`${s.day}-${s.period}`)) {
      conflicts.push({ type: "teacher-unavailable", teacherId: s.teacherId, day: s.day, period: s.period, slot: s })
    }
  }

  // Subject shortfall vs required periods.
  for (const cls of input.classes) {
    for (const subj of cls.subjects) {
      const got = slots.filter(
        (s) => s.classId === cls.classId && s.sectionId === cls.sectionId && s.subjectId === subj.subjectId,
      ).length
      if (got !== subj.periodsPerWeek) {
        conflicts.push({
          type: "subject-shortfall",
          classId: cls.classId,
          subjectId: subj.subjectId,
          required: subj.periodsPerWeek,
          got,
        })
      }
    }
  }

  return conflicts
}
