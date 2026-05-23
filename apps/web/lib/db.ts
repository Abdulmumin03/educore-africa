import { PrismaClient, Prisma } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

// ─────────────────────────────────────────────────────────────────
// Multi-tenant helper: withSchool(schoolId)
//
// Returns a Prisma client extension that auto-injects `{ schoolId }`
// into every read/write on tenant-scoped models. Any caller that
// forgets to filter by tenant still gets isolated.
//
// Usage:
//   const db = withSchool(session.user.schoolId)
//   await db.student.findMany()          // scoped automatically
//   await db.student.create({ data })    // schoolId injected
//
// Models without a `schoolId` column (e.g. Session) bypass the filter.
// ─────────────────────────────────────────────────────────────────

const TENANT_MODELS = new Set([
  "User",
  "AcademicYear",
  "Class",
  "Section",
  "Subject",
  "Staff",
  "Student",
  "Parent",
  "Enrollment",
  "Attendance",
  "Grade",
  "Assignment",
  "FeeStructure",
  "FeeInvoice",
  "Payment",
  "Notification",
  "AuditLog",
  "AIRiskScore",
  "Message",
  "Hostel",
  "Library",
  "BusRoute",
  "VisitorLog",
  "Timetable",
])

const READ_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
])

const WRITE_MUTATE_OPS = new Set([
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
])

export function withSchool(schoolId: string | null | undefined) {
  if (!schoolId) {
    throw new Error("withSchool() requires a non-null schoolId")
  }

  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model ?? "")) return query(args)

          const a = (args ?? {}) as Record<string, unknown>

          if (READ_OPS.has(operation) || WRITE_MUTATE_OPS.has(operation)) {
            a.where = { ...((a.where as object) ?? {}), schoolId }
          }

          if (operation === "create") {
            a.data = { ...((a.data as object) ?? {}), schoolId }
          }

          if (operation === "createMany" || operation === "createManyAndReturn") {
            const data = a.data as Record<string, unknown> | Record<string, unknown>[]
            a.data = Array.isArray(data)
              ? data.map((row) => ({ ...row, schoolId }))
              : { ...data, schoolId }
          }

          if (operation === "upsert") {
            a.create = { ...((a.create as object) ?? {}), schoolId }
          }

          return query(a as typeof args)
        },
      },
    },
  })
}

export type TenantPrisma = ReturnType<typeof withSchool>
export { Prisma }
