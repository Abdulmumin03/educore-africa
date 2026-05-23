import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { questionSchema } from "@/lib/ai/question-bank"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const exportSchema = z.object({
  title: z.string().min(1).max(200).default("Exam Questions"),
  subject: z.string().optional(),
  classLevel: z.string().optional(),
  topic: z.string().optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  questions: z.array(questionSchema).min(1).max(100),
})

const ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return new Response("Unauthorized", { status: 401 })
  if (!session.user.schoolId) return new Response("No school context", { status: 400 })
  if (!ROLES.includes(session.user.role)) return new Response("Forbidden", { status: 403 })

  const parsed = exportSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return new Response("Validation failed", { status: 422 })
  const { title, subject, classLevel, topic, difficulty, questions } = parsed.data

  const headerLines = [
    subject ? `Subject: ${subject}` : null,
    classLevel ? `Class: ${classLevel}` : null,
    topic ? `Topic: ${topic}` : null,
    difficulty ? `Difficulty: ${difficulty}` : null,
  ].filter((x): x is string => !!x)

  const children: Paragraph[] = [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
    ...(headerLines.length > 0
      ? [
          new Paragraph({
            children: headerLines.map(
              (line, i) =>
                new TextRun({
                  text: (i === 0 ? "" : " · ") + line,
                  color: "475569",
                }),
            ),
          }),
          new Paragraph({ text: "" }),
        ]
      : []),
  ]

  questions.forEach((q, idx) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${idx + 1}. `, bold: true }),
          new TextRun(q.question),
        ],
      }),
    )
    if (q.options && q.options.length > 0) {
      q.options.forEach((opt) => {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `   ${opt.label}. ${opt.text}` })],
          }),
        )
      })
    }
    children.push(new Paragraph({ text: "" }))
  })

  // Answer key on a separate page.
  children.push(
    new Paragraph({ text: "Answer Key", heading: HeadingLevel.HEADING_2, pageBreakBefore: true }),
  )
  questions.forEach((q, idx) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${idx + 1}. `, bold: true }),
          new TextRun({ text: q.answer }),
        ],
      }),
    )
    if (q.explanation) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "   Explanation: ", italics: true, color: "475569" }),
            new TextRun({ text: q.explanation, color: "475569" }),
          ],
        }),
      )
    }
  })

  const doc = new Document({
    sections: [{ properties: {}, children }],
  })
  const buf = await Packer.toBuffer(doc)
  const filename = `${title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "questions"}.docx`
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}
