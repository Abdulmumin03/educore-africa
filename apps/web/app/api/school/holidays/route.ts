import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  startDate: z.string(),
  endDate: z.string(),
  description: z.string().max(300).optional(),
})

export async function POST(req: Request) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })

  const start = new Date(parsed.data.startDate)
  const end = new Date(parsed.data.endDate)
  if (end < start) return NextResponse.json({ error: "endDate before startDate" }, { status: 422 })

  const created = await prisma.holiday.create({
    data: {
      schoolId: g.session.user.schoolId,
      name: parsed.data.name,
      startDate: start,
      endDate: end,
      description: parsed.data.description ?? null,
    },
  })
  return NextResponse.json({ ok: true, id: created.id })
}
