import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma, UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getDefaultLibrary } from "@/lib/library-helpers"

export const runtime = "nodejs"

const WRITE_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "LIBRARIAN",
]

const listQuerySchema = z.object({
  q: z.string().max(80).optional(),
  category: z.string().max(80).optional(),
  subjectId: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(60),
})

const createSchema = z.object({
  title: z.string().trim().min(2).max(200),
  author: z.string().trim().max(120).optional(),
  isbn: z.string().trim().max(40).optional(),
  category: z.string().trim().max(60).optional(),
  subjectId: z.string().cuid().nullable().optional(),
  publisher: z.string().trim().max(120).optional(),
  year: z.number().int().min(1500).max(new Date().getFullYear() + 1).optional(),
  description: z.string().max(2000).optional(),
  coverUrl: z.string().url().nullable().optional(),
  totalCopies: z.number().int().min(1).max(10000).default(1),
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const url = new URL(req.url)
  const parsed = listQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    subjectId: url.searchParams.get("subjectId") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 422 })
  const { q, category, subjectId, limit } = parsed.data

  const where: Prisma.LibraryBookWhereInput = {
    library: { schoolId: session.user.schoolId, deletedAt: null },
    deletedAt: null,
  }
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { author: { contains: q, mode: "insensitive" } },
      { isbn: { contains: q, mode: "insensitive" } },
    ]
  }
  if (category) where.category = { equals: category, mode: "insensitive" }
  if (subjectId) where.subjectId = subjectId

  const rows = await prisma.libraryBook.findMany({
    where,
    orderBy: [{ title: "asc" }],
    take: limit,
    include: {
      subject: { select: { id: true, name: true, code: true } },
    },
  })

  // Distinct categories for the UI filter.
  const categories = await prisma.libraryBook.findMany({
    where: {
      library: { schoolId: session.user.schoolId, deletedAt: null },
      deletedAt: null,
      category: { not: null },
    },
    select: { category: true },
    distinct: ["category"],
  })

  return NextResponse.json({
    items: rows.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      isbn: b.isbn,
      category: b.category,
      subject: b.subject,
      publisher: b.publisher,
      year: b.year,
      description: b.description,
      coverUrl: b.coverUrl,
      totalCopies: b.totalCopies,
      availableCopies: b.availableCopies,
    })),
    categories: categories.map((c) => c.category).filter((c): c is string => !!c),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data
  const schoolId = session.user.schoolId

  if (data.subjectId) {
    const subj = await prisma.subject.findFirst({
      where: { id: data.subjectId, schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!subj) return NextResponse.json({ error: "Invalid subject" }, { status: 422 })
  }

  const lib = await getDefaultLibrary(schoolId)

  try {
    const created = await prisma.libraryBook.create({
      data: {
        libraryId: lib.id,
        title: data.title,
        author: data.author ?? null,
        isbn: data.isbn || null,
        category: data.category ?? null,
        subjectId: data.subjectId ?? null,
        publisher: data.publisher ?? null,
        year: data.year ?? null,
        description: data.description ?? null,
        coverUrl: data.coverUrl ?? null,
        totalCopies: data.totalCopies,
        availableCopies: data.totalCopies,
      },
      select: { id: true },
    })
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && /Unique constraint/i.test(err.message)) {
      return NextResponse.json(
        { error: "A book with that ISBN already exists in this library." },
        { status: 409 },
      )
    }
    throw err
  }
}
