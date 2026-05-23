import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveStudentAccess, canWriteStudents } from "@/lib/student-access"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const access = await resolveStudentAccess()
  if (!access.ok) return access.response
  if (!canWriteStudents(access.session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim()
  if (q.length < 2) return NextResponse.json({ items: [] })

  const parents = await prisma.parent.findMany({
    where: {
      schoolId: access.session.schoolId,
      deletedAt: null,
      OR: [
        { user: { firstName: { contains: q, mode: "insensitive" } } },
        { user: { lastName: { contains: q, mode: "insensitive" } } },
        { user: { phone: { contains: q } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ],
    },
    take: 10,
    include: {
      user: { select: { firstName: true, lastName: true, phone: true, email: true } },
      students: { select: { studentId: true } },
    },
  })

  return NextResponse.json({
    items: parents.map((p) => ({
      id: p.id,
      firstName: p.user.firstName,
      lastName: p.user.lastName,
      phone: p.user.phone,
      email: p.user.email,
      relationship: p.relationship,
      occupation: p.occupation,
      address: p.address,
      childCount: p.students.length,
    })),
  })
}
