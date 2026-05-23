import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId) {
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  }

  const terms = await prisma.term.findMany({
    where: { academicYear: { schoolId: session.user.schoolId }, deletedAt: null },
    orderBy: [{ academicYear: { startDate: "desc" } }, { startDate: "asc" }],
    include: { academicYear: { select: { name: true, isCurrent: true } } },
  })

  return NextResponse.json({
    items: terms.map((t) => ({
      id: t.id,
      type: t.type,
      isCurrent: t.isCurrent,
      sessionName: t.academicYear.name,
      sessionIsCurrent: t.academicYear.isCurrent,
    })),
  })
}
