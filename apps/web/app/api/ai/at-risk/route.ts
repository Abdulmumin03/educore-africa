import { NextResponse } from "next/server"
import type { RiskLevel } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "COUNSELOR"]

/**
 * Most recent risk score per student. Returns 0 rows until the prediction
 * engine has been run at least once.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!VIEW_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const level = url.searchParams.get("level") as RiskLevel | null

  // Most-recent score per student: pull latest then dedupe in memory. Small
  // schools won't hit perf issues; if you grow past ~1k students, swap to a
  // SQL DISTINCT ON in a future iteration.
  const all = await prisma.aIRiskScore.findMany({
    where: { schoolId: session.user.schoolId, deletedAt: null },
    orderBy: [{ studentId: "asc" }, { computedAt: "desc" }],
    include: {
      student: {
        include: {
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
          enrollments: {
            where: { isActive: true, deletedAt: null },
            take: 1,
            include: { class: { select: { name: true } }, section: { select: { name: true } } },
          },
        },
      },
    },
  })

  const seen = new Set<string>()
  const latest = []
  for (const r of all) {
    if (seen.has(r.studentId)) continue
    seen.add(r.studentId)
    if (level && r.level !== level) continue
    latest.push(r)
  }

  latest.sort((a, b) => Number(b.score) - Number(a.score))

  const lastRun = all[0]?.computedAt ?? null
  const summary = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }
  for (const r of latest) summary[r.level] += 1

  return NextResponse.json({
    items: latest.map((r) => {
      const enr = r.student.enrollments[0]
      const factors = (r.factors ?? {}) as Record<string, number>
      return {
        id: r.id,
        studentId: r.studentId,
        firstName: r.student.user.firstName,
        lastName: r.student.user.lastName,
        avatarUrl: r.student.user.avatarUrl,
        admissionNumber: r.student.admissionNumber,
        className: enr?.class.name ?? null,
        sectionName: enr?.section.name ?? null,
        score: Math.round(Number(r.score) * 100),
        level: r.level,
        recommendation: r.rationale,
        attendanceScore: factors.attendanceScore ?? null,
        gradeScore: factors.gradeScore ?? null,
        behaviorScore: factors.behaviorScore ?? null,
        engagementScore: factors.engagementScore ?? null,
        trendScore: factors.trendScore ?? null,
        computedAt: r.computedAt.toISOString(),
      }
    }),
    summary,
    lastRun: lastRun?.toISOString() ?? null,
    model: all[0]?.model ?? null,
  })
}
