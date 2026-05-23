import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(15),
  category: z.enum(["CORE", "ELECTIVE", "TRADE"]),
  creditUnits: z.number().int().min(1).max(10),
  isActive: z.boolean(),
})

export async function POST(req: Request) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })

  try {
    const subj = await prisma.subject.create({
      data: {
        schoolId: g.session.user.schoolId,
        ...parsed.data,
        isCore: parsed.data.category === "CORE",
      },
    })
    return NextResponse.json({ ok: true, id: subj.id })
  } catch {
    return NextResponse.json({ error: "Subject code already exists" }, { status: 409 })
  }
}
