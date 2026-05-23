import { NextResponse } from "next/server"
import { z } from "zod"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import {
  academicAnalytics,
  attendanceAnalytics,
  enrollmentAnalytics,
  financialAnalytics,
  predictionsAnalytics,
  staffAnalytics,
} from "@/lib/analytics"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VIEW_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const ALLOWED = new Set([
  "academic",
  "attendance",
  "financial",
  "enrollment",
  "staff",
  "predictions",
])

export async function GET(
  req: Request,
  { params }: { params: { type: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!VIEW_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (!ALLOWED.has(params.type)) {
    return NextResponse.json({ error: "Unknown report" }, { status: 404 })
  }

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: "from and to (YYYY-MM-DD) required" },
      { status: 422 },
    )
  }
  const range = {
    schoolId: session.user.schoolId,
    from: new Date(`${parsed.data.from}T00:00:00`),
    to: new Date(`${parsed.data.to}T23:59:59.999`),
  }

  switch (params.type) {
    case "academic":
      return NextResponse.json(await academicAnalytics(range))
    case "attendance":
      return NextResponse.json(await attendanceAnalytics(range))
    case "financial":
      return NextResponse.json(await financialAnalytics(range))
    case "enrollment":
      return NextResponse.json(await enrollmentAnalytics(range))
    case "staff":
      return NextResponse.json(await staffAnalytics(range))
    case "predictions":
      return NextResponse.json(await predictionsAnalytics(range))
  }
  return NextResponse.json({ error: "Unknown" }, { status: 404 })
}
