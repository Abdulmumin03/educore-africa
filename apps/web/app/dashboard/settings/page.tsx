import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { resolveSettings } from "@/lib/school-settings"
import { listCurricula } from "@/lib/curriculum"
import { SettingsClient } from "@/components/dashboard/settings/settings-client"

export const metadata = { title: "School settings · EduCore Africa" }

export default async function SchoolSettingsPage() {
  const session = await auth()
  if (!session?.user || !["SCHOOL_ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    redirect("/dashboard?forbidden=1")
  }
  const schoolId = session.user.schoolId
  if (!schoolId) redirect("/dashboard")

  const [school, academicYears, holidays, classes, subjects, curricula, templates] =
    await Promise.all([
      prisma.school.findUnique({ where: { id: schoolId } }),
      prisma.academicYear.findMany({
        where: { schoolId, deletedAt: null },
        orderBy: { startDate: "desc" },
        include: { terms: { orderBy: { startDate: "asc" } } },
      }),
      prisma.holiday.findMany({
        where: { schoolId, deletedAt: null },
        orderBy: { startDate: "asc" },
      }),
      prisma.class.findMany({
        where: { schoolId, deletedAt: null },
        orderBy: { level: "asc" },
        include: {
          sections: { where: { deletedAt: null }, orderBy: { name: "asc" } },
        },
      }),
      prisma.subject.findMany({
        where: { schoolId, deletedAt: null },
        orderBy: { name: "asc" },
        include: { curricula: { select: { curriculumId: true } } },
      }),
      listCurricula(schoolId),
      prisma.reportTemplate.findMany({
        where: { schoolId, deletedAt: null },
        orderBy: [{ kind: "asc" }, { isDefault: "desc" }, { name: "asc" }],
      }),
    ])

  if (!school) redirect("/dashboard")

  return (
    <SettingsClient
      school={{
        id: school.id,
        name: school.name,
        slug: school.slug,
        motto: school.motto,
        slogan: school.slogan,
        logoUrl: school.logoUrl,
        address: school.address,
        state: school.state,
        city: school.city,
        country: school.country,
        phone: school.phone,
        email: school.email,
        website: school.website,
        accreditationNumber: school.accreditationNumber,
        ministryRegNumber: school.ministryRegNumber,
      }}
      academicYears={academicYears.map((ay) => ({
        id: ay.id,
        name: ay.name,
        startDate: ay.startDate.toISOString(),
        endDate: ay.endDate.toISOString(),
        isCurrent: ay.isCurrent,
        terms: ay.terms.map((t) => ({
          id: t.id,
          type: t.type,
          startDate: t.startDate.toISOString(),
          endDate: t.endDate.toISOString(),
          isCurrent: t.isCurrent,
        })),
      }))}
      holidays={holidays.map((h) => ({
        id: h.id,
        name: h.name,
        startDate: h.startDate.toISOString(),
        endDate: h.endDate.toISOString(),
        description: h.description,
      }))}
      classes={classes.map((c) => ({
        id: c.id,
        name: c.name,
        level: c.level,
        curriculumId: c.curriculumId,
        sections: c.sections.map((s) => ({
          id: s.id,
          name: s.name,
          capacity: s.capacity,
        })),
      }))}
      subjects={subjects.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        category: s.category,
        creditUnits: s.creditUnits,
        isCore: s.isCore,
        isActive: s.isActive,
        curriculumIds: s.curricula.map((c) => c.curriculumId),
      }))}
      curricula={curricula.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        examBodyCode: c.examBodyCode,
        isDefault: c.isDefault,
        gradingScale: c.gradingScale,
        aiPromptHint: c.aiPromptHint,
        midtermComponents: c.midtermComponents,
      }))}
      reportTemplates={templates.map((t) => ({
        id: t.id,
        kind: t.kind,
        name: t.name,
        curriculumId: t.curriculumId,
        isDefault: t.isDefault,
        config: t.config,
      }))}
      settings={resolveSettings(school.settings)}
    />
  )
}
