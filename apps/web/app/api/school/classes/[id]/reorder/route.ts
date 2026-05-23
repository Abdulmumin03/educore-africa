import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

const schema = z.object({ direction: z.enum(["up", "down"]) })

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })

  const classes = await prisma.class.findMany({
    where: { schoolId: g.session.user.schoolId, deletedAt: null },
    orderBy: { level: "asc" },
  })
  const i = classes.findIndex((c) => c.id === params.id)
  if (i < 0) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const j = parsed.data.direction === "up" ? i - 1 : i + 1
  if (j < 0 || j >= classes.length) return NextResponse.json({ ok: true })

  // Swap levels.
  const a = classes[i]
  const b = classes[j]
  await prisma.$transaction([
    prisma.class.update({ where: { id: a.id }, data: { level: -1 } }), // temp to avoid unique conflicts
    prisma.class.update({ where: { id: b.id }, data: { level: a.level } }),
    prisma.class.update({ where: { id: a.id }, data: { level: b.level } }),
  ])

  return NextResponse.json({ ok: true })
}
