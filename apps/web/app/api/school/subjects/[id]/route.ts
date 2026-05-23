import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  category: z.enum(["CORE", "ELECTIVE", "TRADE"]).optional(),
  creditUnits: z.number().int().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })

  const data: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.category) data.isCore = parsed.data.category === "CORE"

  const result = await prisma.subject.updateMany({
    where: { id: params.id, schoolId: g.session.user.schoolId, deletedAt: null },
    data,
  })
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const result = await prisma.subject.updateMany({
    where: { id: params.id, schoolId: g.session.user.schoolId, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  })
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
