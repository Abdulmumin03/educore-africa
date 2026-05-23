import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveStudentAccess, canWriteStudents } from "@/lib/student-access"
import { healthEntrySchema } from "@/lib/student-schemas"

export const runtime = "nodejs"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStudentAccess()
  if (!access.ok) return access.response
  if (access.visibility.ids && !access.visibility.ids.includes(params.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const entries = await prisma.healthEntry.findMany({
    where: {
      studentId: params.id,
      schoolId: access.session.schoolId,
      deletedAt: null,
    },
    orderBy: { date: "desc" },
  })
  return NextResponse.json({
    items: entries.map((e) => ({
      id: e.id,
      date: e.date.toISOString().slice(0, 10),
      description: e.description,
      actionTaken: e.actionTaken,
    })),
  })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStudentAccess()
  if (!access.ok) return access.response
  if (!canWriteStudents(access.session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = healthEntrySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const entry = await prisma.healthEntry.create({
    data: {
      schoolId: access.session.schoolId,
      studentId: student.id,
      date: new Date(parsed.data.date),
      description: parsed.data.description,
      actionTaken: parsed.data.actionTaken || null,
      recordedById: access.session.userId,
    },
  })
  return NextResponse.json({ ok: true, id: entry.id })
}
