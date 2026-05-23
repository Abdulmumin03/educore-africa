import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const q = (url.searchParams.get("q") ?? "").trim()
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 5), 20)

  if (q.length < 2 || !session.user.schoolId) {
    return NextResponse.json({ students: [], staff: [] })
  }

  const schoolId = session.user.schoolId

  const [students, staff] = await Promise.all([
    prisma.student.findMany({
      where: {
        schoolId,
        deletedAt: null,
        OR: [
          { admissionNumber: { contains: q, mode: "insensitive" } },
          { user: { firstName: { contains: q, mode: "insensitive" } } },
          { user: { lastName: { contains: q, mode: "insensitive" } } },
        ],
      },
      take: limit,
      select: {
        id: true,
        admissionNumber: true,
        user: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.staff.findMany({
      where: {
        schoolId,
        deletedAt: null,
        OR: [
          { staffNumber: { contains: q, mode: "insensitive" } },
          { user: { firstName: { contains: q, mode: "insensitive" } } },
          { user: { lastName: { contains: q, mode: "insensitive" } } },
        ],
      },
      take: limit,
      select: {
        id: true,
        staffNumber: true,
        user: { select: { firstName: true, lastName: true } },
      },
    }),
  ])

  return NextResponse.json({
    students: students.map((s) => ({
      id: s.id,
      label: `${s.user.firstName} ${s.user.lastName}`,
      sub: s.admissionNumber,
      href: `/dashboard/students/${s.id}`,
      kind: "student" as const,
    })),
    staff: staff.map((s) => ({
      id: s.id,
      label: `${s.user.firstName} ${s.user.lastName}`,
      sub: s.staffNumber,
      href: `/dashboard/staff/${s.id}`,
      kind: "staff" as const,
    })),
  })
}
