import { resolveStudentAccess } from "@/lib/student-access"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

function csvEscape(v: unknown) {
  if (v === null || v === undefined) return ""
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export async function GET(req: Request) {
  const access = await resolveStudentAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  if ((url.searchParams.get("format") ?? "csv").toLowerCase() !== "csv") {
    return new Response("Only csv format is supported", { status: 400 })
  }

  const rows = await prisma.student.findMany({
    where: {
      schoolId: access.session.schoolId,
      deletedAt: null,
      ...(access.visibility.ids ? { id: { in: access.visibility.ids } } : {}),
    },
    orderBy: { admissionNumber: "asc" },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      enrollments: {
        where: { isActive: true, deletedAt: null },
        take: 1,
        include: { class: true, section: true, academicYear: true },
      },
    },
  })

  const header = [
    "admissionNumber",
    "firstName",
    "lastName",
    "middleName",
    "gender",
    "dateOfBirth",
    "class",
    "arm",
    "academicYear",
    "admissionDate",
    "status",
    "stateOfOrigin",
    "lga",
    "nationality",
    "bloodGroup",
    "genotype",
  ]
  const lines = [header.join(",")]
  for (const s of rows) {
    const e = s.enrollments[0]
    lines.push(
      [
        s.admissionNumber,
        s.user.firstName,
        s.user.lastName,
        s.middleName ?? "",
        s.gender,
        s.dateOfBirth.toISOString().slice(0, 10),
        e?.class.name ?? "",
        e?.section.name ?? "",
        e?.academicYear.name ?? "",
        s.admissionDate.toISOString().slice(0, 10),
        s.status,
        s.stateOfOrigin ?? "",
        s.lga ?? "",
        s.nationality,
        s.bloodGroup ?? "",
        s.genotype ?? "",
      ]
        .map(csvEscape)
        .join(","),
    )
  }

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="students-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
