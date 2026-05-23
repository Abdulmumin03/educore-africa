import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveStudentAccess, canWriteStudents } from "@/lib/student-access"
import { documentSchema } from "@/lib/student-schemas"

export const runtime = "nodejs"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStudentAccess()
  if (!access.ok) return access.response
  if (!canWriteStudents(access.session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = documentSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const doc = await prisma.studentDocument.create({
    data: {
      schoolId: access.session.schoolId,
      studentId: student.id,
      kind: parsed.data.kind,
      label: parsed.data.label || null,
      url: parsed.data.url,
      fileSize: parsed.data.fileSize ?? null,
      uploadedById: access.session.userId,
    },
  })
  return NextResponse.json({ ok: true, id: doc.id })
}
