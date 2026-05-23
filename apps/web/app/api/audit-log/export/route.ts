import type { Prisma, UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VIEW_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

function csv(s: string | null | undefined): string {
  if (s == null) return ""
  const v = String(s)
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return new Response("Unauthorized", { status: 401 })
  if (!session.user.schoolId) return new Response("No school context", { status: 400 })
  if (!VIEW_ROLES.includes(session.user.role)) return new Response("Forbidden", { status: 403 })

  const url = new URL(req.url)
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")

  const where: Prisma.AuditLogWhereInput = { schoolId: session.user.schoolId }
  if (from || to) {
    where.createdAt = {}
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from))
      (where.createdAt as Prisma.DateTimeFilter).gte = new Date(`${from}T00:00:00`)
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to))
      (where.createdAt as Prisma.DateTimeFilter).lte = new Date(`${to}T23:59:59.999`)
  }

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10_000,
    include: {
      user: { select: { firstName: true, lastName: true, role: true } },
    },
  })

  const header = [
    "Timestamp",
    "User",
    "Role",
    "Action",
    "Entity",
    "Record ID",
    "IP",
    "Changes",
  ]
  const lines = [header.map(csv).join(",")]
  for (const r of rows) {
    lines.push(
      [
        r.createdAt.toISOString(),
        r.user ? `${r.user.firstName} ${r.user.lastName}` : "",
        r.user?.role ?? "",
        r.action,
        r.entityType,
        r.entityId ?? "",
        r.ipAddress ?? "",
        r.payload ? JSON.stringify(r.payload) : "",
      ]
        .map(csv)
        .join(","),
    )
  }

  const body = lines.join("\n")
  const tag = from && to ? `${from}-to-${to}` : "all"
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="audit-log-${tag}.csv"`,
    },
  })
}
