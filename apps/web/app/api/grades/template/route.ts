import { prisma } from "@/lib/db"
import { resolveGradeAccess } from "@/lib/grade-access"
import { getGradingConfig } from "@/lib/grade-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * CSV template for bulk grade import. Includes one row per active student in
 * the section, with admission no + name pre-filled and empty score cells.
 */
export async function GET(req: Request) {
  const access = await resolveGradeAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const sectionId = url.searchParams.get("sectionId")
  const subjectId = url.searchParams.get("subjectId")
  if (!sectionId || !subjectId) {
    return new Response("sectionId + subjectId required", { status: 422 })
  }

  const [section, subject, config, enrollments] = await Promise.all([
    prisma.section.findFirst({
      where: { id: sectionId, schoolId: access.session.schoolId, deletedAt: null },
      include: { class: { select: { name: true } } },
    }),
    prisma.subject.findFirst({
      where: { id: subjectId, schoolId: access.session.schoolId, deletedAt: null },
    }),
    getGradingConfig(access.session.schoolId),
    prisma.enrollment.findMany({
      where: {
        sectionId,
        isActive: true,
        deletedAt: null,
        student: { status: "ACTIVE", deletedAt: null },
      },
      include: {
        student: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { student: { user: { lastName: "asc" } } },
    }),
  ])
  if (!section || !subject) return new Response("Not found", { status: 404 })

  const header = ["admission_no", "name", ...config.caComponents, "exam", "teacher_remark"]
  const rows = enrollments.map((e) => {
    const name = `${e.student.user.firstName} ${e.student.user.lastName}`
    return [e.student.admissionNumber, name, ...config.caComponents.map(() => ""), "", ""]
  })

  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n")

  const filename = `grades-${section.class.name}-${section.name}-${subject.code}.csv`
    .replace(/\s+/g, "_")
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}
