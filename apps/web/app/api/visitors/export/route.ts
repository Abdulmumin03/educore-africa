import type { Prisma, UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const EXPORT_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

function csvField(s: string | null | undefined): string {
  if (s == null) return ""
  const v = String(s)
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

/**
 * GET /api/visitors/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns a CSV download of visits in the date range (inclusive).
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return new Response("Unauthorized", { status: 401 })
  if (!session.user.schoolId) return new Response("No school context", { status: 400 })
  if (!EXPORT_ROLES.includes(session.user.role)) return new Response("Forbidden", { status: 403 })

  const url = new URL(req.url)
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new Response("from and to (YYYY-MM-DD) required", { status: 422 })
  }

  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T23:59:59.999`)

  const where: Prisma.VisitorLogWhereInput = {
    schoolId: session.user.schoolId,
    deletedAt: null,
    checkedInAt: { gte: start, lte: end },
  }

  const rows = await prisma.visitorLog.findMany({
    where,
    orderBy: { checkedInAt: "asc" },
    include: {
      host: { select: { firstName: true, lastName: true, role: true } },
    },
  })

  const header = [
    "Visitor name",
    "Phone",
    "ID number",
    "Purpose",
    "Host",
    "Host role",
    "Checked in",
    "Checked out",
    "Status",
  ]
  const lines = [header.map(csvField).join(",")]
  for (const v of rows) {
    lines.push(
      [
        v.visitorName,
        v.visitorPhone,
        v.idNumber,
        v.purpose,
        v.host ? `${v.host.firstName} ${v.host.lastName}` : "",
        v.host?.role ?? "",
        v.checkedInAt.toISOString(),
        v.checkedOutAt?.toISOString() ?? "",
        v.checkedOutAt ? "Checked out" : "On premises",
      ]
        .map(csvField)
        .join(","),
    )
  }
  const csv = lines.join("\n")

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="visitors-${from}-to-${to}.csv"`,
    },
  })
}
