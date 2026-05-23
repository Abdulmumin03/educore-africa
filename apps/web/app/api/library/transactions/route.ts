import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma, UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { computeFine, defaultLoanDays, getFineRate } from "@/lib/library-helpers"

export const runtime = "nodejs"

const WRITE_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "LIBRARIAN",
]

const issueSchema = z.object({
  action: z.literal("issue"),
  bookId: z.string().cuid(),
  studentId: z.string().cuid(),
  dueDate: z.string().datetime().optional(),
})
const returnSchema = z.object({
  action: z.literal("return"),
  transactionId: z.string().cuid().optional(),
  bookId: z.string().cuid().optional(),
  studentId: z.string().cuid().optional(),
}).refine((v) => !!v.transactionId || (!!v.bookId && !!v.studentId), {
  message: "Provide transactionId, or both bookId and studentId.",
})

const bodySchema = z.discriminatedUnion("action", [issueSchema, returnSchema])

const listSchema = z.object({
  studentId: z.string().cuid().optional(),
  bookId: z.string().cuid().optional(),
  status: z.enum(["active", "returned", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const url = new URL(req.url)
  const parsed = listSchema.safeParse({
    studentId: url.searchParams.get("studentId") ?? undefined,
    bookId: url.searchParams.get("bookId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 422 })
  const { studentId, bookId, status, limit } = parsed.data

  const where: Prisma.LibraryTransactionWhereInput = {
    book: { library: { schoolId: session.user.schoolId } },
    deletedAt: null,
  }
  if (studentId) where.studentId = studentId
  if (bookId) where.bookId = bookId
  if (status === "active") where.returnedAt = null
  else if (status === "returned") where.returnedAt = { not: null }

  // Students can only see their own borrow history.
  if (session.user.role === "STUDENT") {
    const me = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!me) return NextResponse.json({ items: [] })
    where.studentId = me.id
  }

  const rows = await prisma.libraryTransaction.findMany({
    where,
    orderBy: { borrowedAt: "desc" },
    take: limit,
    include: {
      book: { select: { id: true, title: true, author: true, coverUrl: true } },
      student: {
        select: {
          id: true,
          admissionNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  })

  const now = Date.now()
  return NextResponse.json({
    items: rows.map((t) => ({
      id: t.id,
      borrowedAt: t.borrowedAt.toISOString(),
      dueDate: t.dueDate.toISOString(),
      returnedAt: t.returnedAt?.toISOString() ?? null,
      fine: t.fine ? Number(t.fine) : null,
      overdue: !t.returnedAt && t.dueDate.getTime() < now,
      book: t.book,
      student: {
        id: t.student.id,
        admissionNumber: t.student.admissionNumber,
        firstName: t.student.user.firstName,
        lastName: t.student.user.lastName,
      },
    })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const schoolId = session.user.schoolId

  if (parsed.data.action === "issue") {
    const { bookId, studentId, dueDate } = parsed.data
    const [book, student] = await Promise.all([
      prisma.libraryBook.findFirst({
        where: {
          id: bookId,
          library: { schoolId, deletedAt: null },
          deletedAt: null,
        },
        select: { id: true, availableCopies: true, totalCopies: true, title: true },
      }),
      prisma.student.findFirst({
        where: { id: studentId, schoolId, deletedAt: null },
        select: { id: true },
      }),
    ])
    if (!book) return NextResponse.json({ error: "Invalid book" }, { status: 422 })
    if (!student) return NextResponse.json({ error: "Invalid student" }, { status: 422 })
    if (book.availableCopies < 1) {
      return NextResponse.json({ error: "No copies available." }, { status: 409 })
    }

    // Student must not already have an active loan of this book.
    const existing = await prisma.libraryTransaction.findFirst({
      where: { bookId: book.id, studentId: student.id, returnedAt: null, deletedAt: null },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { error: "Student already has this book on loan." },
        { status: 409 },
      )
    }

    const due = dueDate
      ? new Date(dueDate)
      : new Date(Date.now() + defaultLoanDays() * 24 * 60 * 60 * 1000)

    const [, t] = await prisma.$transaction([
      prisma.libraryBook.update({
        where: { id: book.id },
        data: { availableCopies: { decrement: 1 } },
      }),
      prisma.libraryTransaction.create({
        data: {
          bookId: book.id,
          studentId: student.id,
          dueDate: due,
        },
        select: { id: true, dueDate: true, borrowedAt: true },
      }),
    ])

    return NextResponse.json({
      ok: true,
      id: t.id,
      dueDate: t.dueDate.toISOString(),
      borrowedAt: t.borrowedAt.toISOString(),
    })
  }

  // ---- return action ----
  const { transactionId, bookId, studentId } = parsed.data
  const t = transactionId
    ? await prisma.libraryTransaction.findFirst({
        where: {
          id: transactionId,
          book: { library: { schoolId } },
          returnedAt: null,
          deletedAt: null,
        },
        select: { id: true, bookId: true, dueDate: true },
      })
    : await prisma.libraryTransaction.findFirst({
        where: {
          bookId,
          studentId,
          book: { library: { schoolId } },
          returnedAt: null,
          deletedAt: null,
        },
        orderBy: { borrowedAt: "desc" },
        select: { id: true, bookId: true, dueDate: true },
      })

  if (!t) {
    return NextResponse.json(
      { error: "No active loan found for that book/student." },
      { status: 404 },
    )
  }

  const finePerDay = await getFineRate(schoolId)
  const now = new Date()
  const fine = computeFine(t.dueDate, now, finePerDay)

  await prisma.$transaction([
    prisma.libraryTransaction.update({
      where: { id: t.id },
      data: { returnedAt: now, fine: fine > 0 ? fine : null },
    }),
    prisma.libraryBook.update({
      where: { id: t.bookId },
      data: { availableCopies: { increment: 1 } },
    }),
  ])

  return NextResponse.json({ ok: true, id: t.id, fine, finePerDay })
}
