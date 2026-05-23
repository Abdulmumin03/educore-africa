import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const READ_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "LIBRARIAN",
]

/**
 * Library analytics: most/least borrowed, overdue counter, top readers,
 * "needs replacement" (books with availableCopies < 50% of totalCopies).
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!READ_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const schoolId = session.user.schoolId
  const now = new Date()

  // Active loans, overdue count.
  const [active, overdue] = await Promise.all([
    prisma.libraryTransaction.count({
      where: {
        book: { library: { schoolId } },
        returnedAt: null,
        deletedAt: null,
      },
    }),
    prisma.libraryTransaction.count({
      where: {
        book: { library: { schoolId } },
        returnedAt: null,
        deletedAt: null,
        dueDate: { lt: now },
      },
    }),
  ])

  // Borrow tallies per book — group + sort.
  const tallies = await prisma.libraryTransaction.groupBy({
    by: ["bookId"],
    where: {
      book: { library: { schoolId } },
      deletedAt: null,
    },
    _count: { _all: true },
  })
  const tallyMap = new Map(tallies.map((t) => [t.bookId, t._count._all]))

  const allBooks = await prisma.libraryBook.findMany({
    where: { library: { schoolId, deletedAt: null }, deletedAt: null },
    select: {
      id: true,
      title: true,
      author: true,
      totalCopies: true,
      availableCopies: true,
    },
  })

  const ranked = allBooks
    .map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      borrowCount: tallyMap.get(b.id) ?? 0,
      onLoan: b.totalCopies - b.availableCopies,
      totalCopies: b.totalCopies,
    }))
    .sort((a, b) => b.borrowCount - a.borrowCount)

  const mostBorrowed = ranked.slice(0, 10)
  const leastBorrowed = ranked
    .filter((b) => b.borrowCount === 0)
    .slice(0, 10) // never-borrowed books

  // Top reader students.
  const readerTallies = await prisma.libraryTransaction.groupBy({
    by: ["studentId"],
    where: {
      book: { library: { schoolId } },
      deletedAt: null,
    },
    _count: { _all: true },
    orderBy: { _count: { studentId: "desc" } },
    take: 10,
  })

  const readerIds = readerTallies.map((t) => t.studentId)
  const readers = readerIds.length
    ? await prisma.student.findMany({
        where: { id: { in: readerIds }, schoolId },
        select: {
          id: true,
          admissionNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      })
    : []
  const readerById = new Map(readers.map((r) => [r.id, r]))
  const topReaders = readerTallies
    .map((t) => {
      const s = readerById.get(t.studentId)
      if (!s) return null
      return {
        id: s.id,
        admissionNumber: s.admissionNumber,
        name: `${s.user.firstName} ${s.user.lastName}`,
        borrowCount: t._count._all,
      }
    })
    .filter(Boolean)

  // Needs replacement: high-demand books with limited stock.
  const needsReplacement = ranked
    .filter((b) => b.borrowCount >= 5 && b.totalCopies <= 2)
    .slice(0, 10)

  return NextResponse.json({
    overview: {
      totalBooks: allBooks.length,
      totalCopies: allBooks.reduce((s, b) => s + b.totalCopies, 0),
      activeLoans: active,
      overdueLoans: overdue,
    },
    mostBorrowed,
    leastBorrowed,
    topReaders,
    needsReplacement,
  })
}
