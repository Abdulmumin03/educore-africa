import { z } from "zod"
import { generateJson, FAST_MODEL } from "@/lib/ai"

export const lessonPlanInputSchema = z.object({
  subject: z.string().min(1).max(60),
  classLevel: z.string().min(1).max(40), // e.g. "JSS 2", "SS 1"
  topic: z.string().min(1).max(200),
  durationMin: z.number().int().min(20).max(180).default(40),
})

export type LessonPlanInput = z.infer<typeof lessonPlanInputSchema>

const stepSchema = z.object({
  title: z.string().min(1).max(80),
  minutes: z.number().int().min(1).max(180),
  detail: z.string().min(1).max(600),
})

export const lessonPlanOutputSchema = z.object({
  objectives: z.array(z.string().min(2).max(200)).min(2).max(6),
  methodology: z.enum(["LECTURE", "DISCUSSION", "PRACTICAL", "MIXED"]),
  materials: z.array(z.string().min(1).max(120)).min(1).max(15),
  steps: z.array(stepSchema).min(2).max(8),
  assessment: z.string().min(2).max(600),
  homework: z.string().max(600).optional().default(""),
})

export type LessonPlanOutput = z.infer<typeof lessonPlanOutputSchema>

const DEFAULT_CURRICULUM_HINT =
  "Aligned with the NERDC curriculum. Use realistic Nigerian classroom items and examples."

function buildSystemPrompt(curriculumHint: string): string {
  return `You generate detailed lesson plans for secondary-school teachers.

Curriculum context:
${curriculumHint}

You receive: subject, class level, topic, lesson duration (minutes).

Return STRICT JSON, no markdown, matching exactly this shape:
{
  "objectives": ["3 specific, measurable learning objectives starting with verbs"],
  "methodology": "LECTURE" | "DISCUSSION" | "PRACTICAL" | "MIXED",
  "materials": ["Practical items: textbooks, chalk, lab apparatus, charts"],
  "steps": [
    { "title": "Step name", "minutes": 5, "detail": "What the teacher does and what students do." }
  ],
  "assessment": "How understanding will be checked at the end (questions, exit ticket, quick exercise).",
  "homework": "Optional follow-up task. Empty string if none."
}

Constraints:
  • Objectives: 3–4 items, each starts with an action verb (Define, Explain, Calculate, Demonstrate, Compare).
  • Methodology: pick the SINGLE best fit for the topic.
  • Materials: include realistic classroom items (defer to curriculum context for locale); for sciences include lab apparatus.
  • Steps: 4–6 steps totalling roughly the lesson duration. Common pattern: Introduction → Presentation → Guided practice → Evaluation → Conclusion.
  • Assessment: concrete (e.g. "5-mark exit ticket: solve 3 quadratic equations").
  • Homework: 1 sentence max if included; empty string if the lesson doesn't warrant one.`
}

export async function generateLessonPlan(
  input: LessonPlanInput,
  opts?: { curriculumHint?: string | null },
) {
  const hint = opts?.curriculumHint?.trim() || DEFAULT_CURRICULUM_HINT
  const result = await generateJson<LessonPlanOutput>({
    system: buildSystemPrompt(hint),
    user: JSON.stringify(input),
    model: FAST_MODEL,
    maxTokens: 1800,
  })
  if (!result.ok) return result

  const parsed = lessonPlanOutputSchema.safeParse(result.data)
  if (!parsed.success) {
    return { ok: false as const, error: "AI returned malformed lesson plan" }
  }
  return { ok: true as const, data: parsed.data, model: result.model }
}

/**
 * Render the AI step list into a markdown content body the Tiptap editor can
 * load. Keeps the structured fields (objectives, materials, etc.) separate so
 * the form can edit them independently.
 */
export function stepsToMarkdown(steps: LessonPlanOutput["steps"]): string {
  return steps
    .map((s) => `### ${s.title} (${s.minutes} min)\n\n${s.detail}`)
    .join("\n\n")
}
