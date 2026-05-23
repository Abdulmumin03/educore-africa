import { z } from "zod"
import { generateJson, FAST_MODEL } from "@/lib/ai"

export const generateInputSchema = z.object({
  subject: z.string().min(1).max(80),
  classLevel: z.string().min(1).max(40),
  topic: z.string().min(2).max(200),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  type: z.enum(["MCQ", "THEORY", "FILL_IN_BLANK", "TRUE_FALSE"]),
  count: z.number().int().min(1).max(50),
})

export type GenerateInput = z.infer<typeof generateInputSchema>

export const questionSchema = z.object({
  question: z.string().min(2).max(2000),
  options: z
    .array(
      z.object({
        label: z.string().min(1).max(4),
        text: z.string().min(1).max(500),
      }),
    )
    .max(8)
    .optional(),
  answer: z.string().min(1).max(2000),
  explanation: z.string().max(2000).optional(),
})

export type GeneratedQuestion = z.infer<typeof questionSchema>

const DEFAULT_CURRICULUM_HINT =
  "Aligned with the NERDC curriculum. Match the style of WAEC / NECO papers. Use NGN and culturally Nigerian examples. Hard questions should use WAEC trap-style distractors."

function buildSystemPrompt(curriculumHint: string): string {
  return `You generate exam questions for K-12 schools.

Curriculum context:
${curriculumHint}

Match the format exactly:
  • MCQ — 4 options labelled A-D, exactly one correct. \`answer\` is the option label ("C").
  • THEORY — short essay/short-answer. \`answer\` is the expected model answer, 30-120 words.
  • FILL_IN_BLANK — sentence with a blank shown as "______". \`answer\` is the missing word/phrase.
  • TRUE_FALSE — \`options\` omitted; \`answer\` is "TRUE" or "FALSE".

Each question MUST include a 1-2 sentence \`explanation\` that justifies the correct answer.

Difficulty:
  EASY — recall, single-step.
  MEDIUM — applies a concept; 2-3 steps.
  HARD — synthesises multiple concepts; use distractor style appropriate to the curriculum context above.

Return STRICT JSON only, no markdown:
{"questions":[{"question":"...","options":[{"label":"A","text":"..."}, ...], "answer":"...", "explanation":"..."}]}

Don't repeat the same question twice.`
}

export async function generateQuestions(
  input: GenerateInput,
  opts?: { curriculumHint?: string | null },
): Promise<
  | { ok: true; questions: GeneratedQuestion[]; model: string }
  | { ok: false; error: string }
> {
  const hint = opts?.curriculumHint?.trim() || DEFAULT_CURRICULUM_HINT
  const prompt = [
    `Subject: ${input.subject}`,
    `Class level: ${input.classLevel}`,
    `Topic: ${input.topic}`,
    `Difficulty: ${input.difficulty}`,
    `Question type: ${input.type}`,
    `Count: ${input.count}`,
  ].join("\n")
  const res = await generateJson<{ questions: GeneratedQuestion[] }>({
    system: buildSystemPrompt(hint),
    user: prompt,
    model: FAST_MODEL,
    maxTokens: Math.min(4000, 200 + input.count * 250),
  })
  if (!res.ok) return { ok: false, error: res.error }

  const parsed = z.object({ questions: z.array(questionSchema) }).safeParse(res.data)
  if (!parsed.success) return { ok: false, error: "AI returned malformed questions" }
  return { ok: true, questions: parsed.data.questions, model: res.model }
}
