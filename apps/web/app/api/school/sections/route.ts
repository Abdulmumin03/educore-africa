import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

const schema = z.object({
  classId: z.string(),
  name: z.string().min(1).max(20),
  capacity: z.number().int().min(1).max(200),
})

export async function POST(req: Request) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })

  const klass = await prisma.class.findFirst({
    where: { id: parsed.data.classId, schoolId: g.session.user.schoolId, deletedAt: null },
  })
  if (!klass) return NextResponse.json({ error: "Class not found" }, { status: 404 })

  try {
    const section = await prisma.section.create({
      data: {
        schoolId: g.session.user.schoolId,
        classId: klass.id,
        name: parsed.data.name,
        capacity: parsed.data.capacity,
      },
    })
    return NextResponse.json({ ok: true, id: section.id })
  } catch {
    return NextResponse.json({ error: "Arm with that name already exists" }, { status: 409 })
  }
}
