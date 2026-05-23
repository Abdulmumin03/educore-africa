import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveStudentAccess, canWriteStudents } from "@/lib/student-access"
import { behaviorLogSchema } from "@/lib/student-schemas"

export const runtime = "nodejs"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStudentAccess()
  if (!access.ok) return access.response
  if (access.visibility.ids && !access.visibility.ids.includes(params.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const logs = await prisma.behaviorLog.findMany({
    where: { studentId: params.id, schoolId: access.session.schoolId, deletedAt: null },
    orderBy: { date: "desc" },
  })
  return NextResponse.json({
    items: logs.map((l) => ({
      id: l.id,
      date: l.date.toISOString().slice(0, 10),
      severity: l.severity,
      title: l.title,
      description: l.description,
      actionTaken: l.actionTaken,
      counselorNotes: l.counselorNotes,
    })),
  })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStudentAccess()
  if (!access.ok) return access.response
  if (!canWriteStudents(access.session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = behaviorLogSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const log = await prisma.behaviorLog.create({
    data: {
      schoolId: access.session.schoolId,
      studentId: student.id,
      date: new Date(parsed.data.date),
      severity: parsed.data.severity,
      title: parsed.data.title,
      description: parsed.data.description,
      actionTaken: parsed.data.actionTaken || null,
      counselorNotes: parsed.data.counselorNotes || null,
      recordedById: access.session.userId,
    },
  })
  return NextResponse.json({ ok: true, id: log.id })
}
