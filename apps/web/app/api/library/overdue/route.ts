import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { computeFine, getFineRate } from "@/lib/library-helpers"

export const runtime = "nodejs"

const READ_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "LIBRARIAN",
  "BURSAR",
]

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!READ_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100)))

  const now = new Date()
  const finePerDay = await getFineRate(session.user.schoolId)

  const rows = await prisma.libraryTransaction.findMany({
    where: {
      book: { library: { schoolId: session.user.schoolId } },
      returnedAt: null,
      deletedAt: null,
      dueDate: { lt: now },
    },
    orderBy: { dueDate: "asc" },
    take: limit,
    include: {
      book: { select: { id: true, title: true, author: true } },
      student: {
        select: {
          id: true,
          admissionNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  })

  return NextResponse.json({
    finePerDay,
    items: rows.map((t) => {
      const projectedFine = computeFine(t.dueDate, now, finePerDay)
      const daysOverdue = Math.ceil(
        (now.getTime() - t.dueDate.getTime()) / (24 * 60 * 60 * 1000),
      )
      return {
        id: t.id,
        borrowedAt: t.borrowedAt.toISOString(),
        dueDate: t.dueDate.toISOString(),
        daysOverdue,
        projectedFine,
        book: t.book,
        student: {
          id: t.student.id,
          admissionNumber: t.student.admissionNumber,
          firstName: t.student.user.firstName,
          lastName: t.student.user.lastName,
        },
      }
    }),
  })
}
