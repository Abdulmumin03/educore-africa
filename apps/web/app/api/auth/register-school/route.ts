import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { registerSchoolSchema } from "@/lib/auth-schemas"
import { CLASSES_BY_TIER, armNames, slugify, termDatesFor } from "@/lib/academic-structure"
import { sendEmail, welcomeEmailHtml } from "@/lib/email"
import { findPreset } from "@/lib/curriculum-presets"

export const runtime = "nodejs"

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = registerSchoolSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { school, admin, academic, plan } = parsed.data

  // Pre-flight: unique admin email, unique school slug.
  const [emailTaken, baseSlug] = await Promise.all([
    prisma.user.findUnique({ where: { email: admin.email } }),
    Promise.resolve(slugify(school.schoolName)),
  ])
  if (emailTaken) {
    return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 })
  }

  // Ensure slug is unique by appending a counter when needed.
  let slug = baseSlug || "school"
  let suffix = 0
  while (await prisma.school.findUnique({ where: { slug } })) {
    suffix += 1
    slug = `${baseSlug}-${suffix}`
  }

  const passwordHash = await bcrypt.hash(admin.password, 12)
  const { year: yearDates, terms } = termDatesFor(academic.sessionName)

  const result = await prisma.$transaction(async (tx) => {
    const createdSchool = await tx.school.create({
      data: {
        name: school.schoolName,
        slug,
        address: school.address,
        state: school.state,
        city: school.lga,
        phone: school.phone,
        email: school.email,
        website: school.website || null,
        logoUrl: school.logoUrl || null,
      },
    })

    const adminUser = await tx.user.create({
      data: {
        schoolId: createdSchool.id,
        email: admin.email,
        phone: admin.phone,
        passwordHash,
        role: "SCHOOL_ADMIN",
        firstName: admin.firstName,
        lastName: admin.lastName,
        emailVerified: new Date(),
      },
    })

    const academicYear = await tx.academicYear.create({
      data: {
        schoolId: createdSchool.id,
        name: academic.sessionName,
        startDate: yearDates.startDate,
        endDate: yearDates.endDate,
        isCurrent: true,
      },
    })

    await tx.term.createMany({
      data: terms.map((t, idx) => ({
        academicYearId: academicYear.id,
        type: t.type,
        startDate: t.startDate,
        endDate: t.endDate,
        isCurrent: idx === 0,
      })),
    })

    // Seed a default WAEC curriculum so classes can be tagged (non-null FK).
    // Schools running other curricula add them later in Settings → Curricula.
    const waecPreset = findPreset("WAEC")!
    const defaultCurriculum = await tx.curriculum.create({
      data: {
        schoolId: createdSchool.id,
        code: waecPreset.code,
        name: waecPreset.name,
        examBodyCode: waecPreset.examBodyCode,
        aiPromptHint: waecPreset.aiPromptHint,
        gradingScale: waecPreset.gradingScale,
        isDefault: true,
      },
    })

    // Build Class + Section rows for every selected tier.
    const arms = armNames(academic.armsPerClass)
    for (const tier of academic.sections) {
      for (const cls of CLASSES_BY_TIER[tier]) {
        const klass = await tx.class.create({
          data: {
            schoolId: createdSchool.id,
            name: cls.name,
            level: cls.level,
            curriculumId: defaultCurriculum.id,
          },
        })
        await tx.section.createMany({
          data: arms.map((arm) => ({
            schoolId: createdSchool.id,
            classId: klass.id,
            name: arm,
            capacity: 40,
          })),
        })
      }
    }

    await tx.auditLog.create({
      data: {
        schoolId: createdSchool.id,
        userId: adminUser.id,
        action: "SCHOOL_REGISTERED",
        entityType: "School",
        entityId: createdSchool.id,
        payload: { plan: plan.plan, sections: academic.sections, armsPerClass: academic.armsPerClass },
      },
    })

    return { schoolId: createdSchool.id, slug: createdSchool.slug, adminUserId: adminUser.id }
  })

  // Best-effort welcome email — failures don't break the registration.
  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/login?school=${result.slug}`
  await sendEmail({
    to: admin.email,
    subject: `Welcome to EduCore Africa, ${school.schoolName}`,
    html: welcomeEmailHtml({
      schoolName: school.schoolName,
      adminName: admin.firstName,
      loginUrl,
    }),
  }).catch(() => undefined)

  return NextResponse.json({
    ok: true,
    schoolId: result.schoolId,
    slug: result.slug,
    redirectUrl: `/auth/login?school=${result.slug}`,
  })
}
