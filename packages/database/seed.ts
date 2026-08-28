import { PrismaClient, UserRole } from "@prisma/client"

import { seedSuperAdmin } from "./prisma/seed-superadmin"

const prisma = new PrismaClient()

async function main() {
  // Tenant root
  const school = await prisma.school.upsert({
    where: { slug: "educore-demo" },
    update: {},
    create: {
      name: "EduCore Demo Academy",
      slug: "educore-demo",
      motto: "Knowledge, Discipline, Excellence",
      country: "Nigeria",
      city: "Lagos",
      state: "Lagos",
      currency: "NGN",
      timezone: "Africa/Lagos",
    },
  })

  // Super admin (platform-level, no schoolId)
  await prisma.user.upsert({
    where: { email: "super@educore.africa" },
    update: {},
    create: {
      email: "super@educore.africa",
      role: UserRole.SUPER_ADMIN,
      firstName: "Super",
      lastName: "Admin",
    },
  })

  // School admin
  await prisma.user.upsert({
    where: { email: "admin@educore.africa" },
    update: {},
    create: {
      schoolId: school.id,
      email: "admin@educore.africa",
      role: UserRole.SCHOOL_ADMIN,
      firstName: "Demo",
      lastName: "Admin",
    },
  })

  console.log(`Seeded school ${school.name} (${school.id})`)

  // The Super Admin Console's own data. It is additive and idempotent, and it
  // reads the school/student counts this seed has just written, so it runs
  // last. `pnpm --filter @educore/database seed:superadmin` runs it alone.
  await seedSuperAdmin()
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
