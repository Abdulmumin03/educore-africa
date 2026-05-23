import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveGradeAccess } from "@/lib/grade-access"

export const runtime = "nodejs"

/**
 * POST /api/grades/midterm-reports/[studentId]/lock?termId=X
 * DELETE /api/grades/midterm-reports/[studentId]/lock?termId=X
 *
 * Lock / unlock the comments on a midterm report. Privileged roles only
 * (SUPER_ADMIN, SCHOOL_ADMIN, PRINCIPAL).
 */
export async function POST(req: Request, { params }: { params: { studentId: string } }) {
  return updateLock(req, params.studentId, true)
}

export async function DELETE(req: Request, { params }: { params: { studentId: string } }) {
  return updateLock(req, params.studentId, false)
}

async function updateLock(req: Request, studentId: string, lock: boolean) {
  const access = await resolveGradeAccess()
  if (!access.ok) return access.response
  if (!access.isPrivileged) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const termId = url.searchParams.get("termId")
  if (!termId) return NextResponse.json({ error: "termId required" }, { status: 422 })

  const row = await prisma.midtermReport.findUnique({
    where: { studentId_termId: { studentId, termId } },
    select: { id: true, schoolId: true },
  })
  if (!row || row.schoolId !== access.session.schoolId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.midtermReport.update({
    where: { id: row.id },
    data: { lockedAt: lock ? new Date() : null },
  })

  return NextResponse.json({ ok: true, lockedAt: lock ? new Date().toISOString() : null })
}
