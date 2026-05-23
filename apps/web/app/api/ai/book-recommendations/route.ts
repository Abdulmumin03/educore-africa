import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { generateBookRecommendations } from "@/lib/ai/book-recommendations"

export const runtime = "nodejs"

const bodySchema = z.object({
  studentId: z.string().cuid(),
})

/**
 * POST /api/ai/book-recommendations
 *
 * Body: { studentId }
 * Returns: { recommendations: [{ bookId, title, author, reason }] }
 *
 * Callable by the student themselves, their parent, or any staff member.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { studentId } = parsed.data
  const schoolId = session.user.schoolId

  // Permission: same-school + (admin/staff OR self OR own child).
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId, deletedAt: null },
    select: {
      id: true,
      userId: true,
      user: { select: { firstName: true, lastName: true } },
      enrollments: {
        where: { isActive: true, deletedAt: null },
        select: {
          section: {
            select: {
              staffAssignments: {
                select: { subject: { select: { name: true } } },
                take: 20,
              },
            },
          },
        },
        take: 1,
      },
    },
  })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (session.user.role === "STUDENT" && student.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (session.user.role === "PARENT") {
    const link = await prisma.studentParent.findFirst({
      where: {
        studentId: student.id,
        parent: { userId: session.user.id },
      },
      select: { studentId: true },
    })
    if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const [recent, catalog] = await Promise.all([
    prisma.libraryTransaction.findMany({
      where: { studentId: student.id, deletedAt: null },
      orderBy: { borrowedAt: "desc" },
      take: 10,
      select: {
        returnedAt: true,
        book: { select: { title: true, author: true } },
      },
    }),
    prisma.libraryBook.findMany({
      where: {
        library: { schoolId, deletedAt: null },
        deletedAt: null,
        availableCopies: { gt: 0 },
      },
      take: 80,
      select: {
        id: true,
        title: true,
        author: true,
        category: true,
        subject: { select: { name: true } },
      },
    }),
  ])

  // Subject names — prefer those the student's section teaches.
  const subjectNames = Array.from(
    new Set(
      student.enrollments[0]?.section.staffAssignments
        .map((a) => a.subject?.name)
        .filter((n): n is string => !!n) ?? [],
    ),
  )

  const result = await generateBookRecommendations({
    student: { firstName: student.user.firstName, lastName: student.user.lastName },
    subjects: subjectNames,
    recent: recent.map((r) => ({
      title: r.book.title,
      author: r.book.author,
      returnedAt: r.returnedAt?.toISOString() ?? null,
    })),
    catalog: catalog.map((c) => ({
      id: c.id,
      title: c.title,
      author: c.author,
      category: c.category,
      subject: c.subject?.name ?? null,
    })),
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  // Hydrate the recommendations with catalog details for the UI.
  const byId = new Map(catalog.map((c) => [c.id, c]))
  const hydrated = result.data.recommendations
    .map((r) => {
      const b = byId.get(r.bookId)
      if (!b) return null
      return {
        bookId: b.id,
        title: b.title,
        author: b.author,
        reason: r.reason,
      }
    })
    .filter(Boolean)

  return NextResponse.json({
    ok: true,
    model: result.model,
    recommendations: hydrated,
  })
}
