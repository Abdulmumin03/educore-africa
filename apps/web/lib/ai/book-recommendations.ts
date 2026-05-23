import { z } from "zod"
import { generateJson, FAST_MODEL } from "@/lib/ai"

const recItemSchema = z.object({
  bookId: z.string(),
  reason: z.string().min(5).max(280),
})

export const bookRecsOutputSchema = z.object({
  recommendations: z.array(recItemSchema).min(0).max(5),
})

export type BookRecommendationInput = {
  student: { firstName: string; lastName: string }
  subjects: string[] // subject names the student takes
  recent: { title: string; author: string | null; returnedAt: string | null }[]
  catalog: { id: string; title: string; author: string | null; subject: string | null; category: string | null }[]
}

const SYSTEM = `You recommend library books for a Nigerian secondary school student.

You receive: the student's enrolled subjects, their recent borrow history, and the LIBRARY CATALOG (a list of available books with IDs).

Pick UP TO 3 books from the catalog that:
  • Match a subject the student takes, OR
  • Build on what they've already borrowed (next-step in a series, related topic).
  • Avoid recommending a book they recently borrowed.
  • Prefer in-school catalog over external suggestions — never invent a book ID.

Return STRICT JSON, no markdown:
{
  "recommendations": [
    { "bookId": "<exact id from the catalog>", "reason": "1-sentence why this fits the student." }
  ]
}

If the catalog is empty or there's no good match, return { "recommendations": [] }.`

export async function generateBookRecommendations(input: BookRecommendationInput) {
  if (input.catalog.length === 0) {
    return { ok: true as const, data: { recommendations: [] }, model: "skipped" }
  }
  const result = await generateJson<{ recommendations: { bookId: string; reason: string }[] }>({
    system: SYSTEM,
    user: JSON.stringify(input),
    model: FAST_MODEL,
    maxTokens: 600,
  })
  if (!result.ok) return result

  const parsed = bookRecsOutputSchema.safeParse(result.data)
  if (!parsed.success) {
    return { ok: false as const, error: "AI returned malformed recommendations" }
  }
  // Drop recommendations that don't match a real catalog id (model hallucination).
  const validIds = new Set(input.catalog.map((b) => b.id))
  const filtered = parsed.data.recommendations.filter((r) => validIds.has(r.bookId))
  return {
    ok: true as const,
    data: { recommendations: filtered.slice(0, 3) },
    model: result.model,
  }
}
