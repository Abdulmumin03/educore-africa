import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

const schema = z.object({
  name: z.string().trim().min(1).max(40),
  level: z.number().int().min(1).max(99),
})

export async function POST(req: Request) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })

  const existing = await prisma.class.findFirst({
    where: { schoolId: g.session.user.schoolId, name: parsed.data.name, deletedAt: null },
  })
  if (existing) return NextResponse.json({ error: "Class name already exists" }, { status: 409 })

  const klass = await prisma.class.create({
    data: { schoolId: g.session.user.schoolId, ...parsed.data },
  })
  return NextResponse.json({ ok: true, id: klass.id })
}
