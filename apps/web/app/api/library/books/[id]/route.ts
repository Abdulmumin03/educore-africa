import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma, UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const WRITE_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "LIBRARIAN",
]

const patchSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  author: z.string().trim().max(120).nullable().optional(),
  isbn: z.string().trim().max(40).nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  subjectId: z.string().cuid().nullable().optional(),
  publisher: z.string().trim().max(120).nullable().optional(),
  year: z.number().int().min(1500).max(new Date().getFullYear() + 1).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  totalCopies: z.number().int().min(1).max(10000).optional(),
})

async function loadBook(id: string, schoolId: string) {
  return prisma.libraryBook.findFirst({
    where: {
      id,
      library: { schoolId, deletedAt: null },
      deletedAt: null,
    },
    include: {
      subject: { select: { id: true, name: true, code: true } },
    },
  })
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const b = await loadBook(params.id, session.user.schoolId)
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
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
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const b = await loadBook(params.id, session.user.schoolId)
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data

  if (data.subjectId) {
    const subj = await prisma.subject.findFirst({
      where: { id: data.subjectId, schoolId: session.user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!subj) return NextResponse.json({ error: "Invalid subject" }, { status: 422 })
  }

  const patch: Prisma.LibraryBookUpdateInput = {}
  if (data.title !== undefined) patch.title = data.title
  if (data.author !== undefined) patch.author = data.author
  if (data.isbn !== undefined) patch.isbn = data.isbn
  if (data.category !== undefined) patch.category = data.category
  if (data.subjectId !== undefined) {
    patch.subject = data.subjectId
      ? { connect: { id: data.subjectId } }
      : { disconnect: true }
  }
  if (data.publisher !== undefined) patch.publisher = data.publisher
  if (data.year !== undefined) patch.year = data.year
  if (data.description !== undefined) patch.description = data.description
  if (data.coverUrl !== undefined) patch.coverUrl = data.coverUrl
  if (data.totalCopies !== undefined) {
    // Adjust availableCopies by the delta so on-loan counts stay correct.
    const delta = data.totalCopies - b.totalCopies
    patch.totalCopies = data.totalCopies
    patch.availableCopies = Math.max(0, b.availableCopies + delta)
  }

  await prisma.libraryBook.update({ where: { id: b.id }, data: patch })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const b = await loadBook(params.id, session.user.schoolId)
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Refuse to delete if any copies are currently on loan.
  if (b.availableCopies < b.totalCopies) {
    return NextResponse.json(
      { error: "Can't delete — some copies are still on loan." },
      { status: 409 },
    )
  }

  await prisma.libraryBook.update({
    where: { id: b.id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
