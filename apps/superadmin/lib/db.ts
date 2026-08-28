import { PrismaClient, Prisma } from "@prisma/client"

// The console talks to the SAME Postgres database as the school platform,
// but deliberately WITHOUT the withSchool() tenant extension used in
// apps/web — super-admins read across every tenant by design. Any route that
// wants a single school's data must filter by schoolId explicitly.

const globalForPrisma = globalThis as unknown as {
  superadminPrisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.superadminPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.superadminPrisma = prisma

export { Prisma }
