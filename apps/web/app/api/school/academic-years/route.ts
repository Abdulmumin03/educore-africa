import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

const schema = z.object({
  name: z.string().regex(/^\d{4}\/\d{4}$/),
  startDate: z.string(),
  endDate: z.string(),
})

export async function POST(req: Request) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })
  const { name, startDate, endDate } = parsed.data

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (end <= start) return NextResponse.json({ error: "endDate must be after startDate" }, { status: 422 })

  const ay = await prisma.$transaction(async (tx) => {
    const created = await tx.academicYear.create({
      data: { schoolId: g.session.user.schoolId, name, startDate: start, endDate: end },
    })
    const ms = end.getTime() - start.getTime()
    const t1End = new Date(start.getTime() + ms / 3)
    const t2End = new Date(start.getTime() + (2 * ms) / 3)
    await tx.term.createMany({
      data: [
        { academicYearId: created.id, type: "FIRST", startDate: start, endDate: t1End },
        { academicYearId: created.id, type: "SECOND", startDate: t1End, endDate: t2End },
        { academicYearId: created.id, type: "THIRD", startDate: t2End, endDate: end },
      ],
    })
    return created
  })

  return NextResponse.json({ ok: true, id: ay.id })
}
