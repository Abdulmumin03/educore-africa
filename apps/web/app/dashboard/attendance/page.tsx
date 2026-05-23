import Link from "next/link"
import dayjs from "dayjs"
import { redirect } from "next/navigation"
import { AlertTriangle, ClipboardCheck, Sparkles, TrendingDown, TrendingUp, Users } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AttendanceHeatmap } from "@/components/dashboard/attendance/attendance-heatmap"
import { cn } from "@/lib/utils"

export const metadata = { title: "Attendance · EduCore Africa" }

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "COUNSELOR"]

function pct(present: number, late: number, total: number): number | null {
  if (total === 0) return null
  return Math.round(((present + late * 0.5) / total) * 100)
}

function tone(p: number | null) {
  if (p === null) return "text-muted-foreground"
  if (p >= 90) return "text-emerald-600"
  if (p >= 75) return "text-amber-600"
  return "text-red-600"
}

export default async function AttendanceDashboardPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!VIEW_ROLES.includes(session.user.role)) redirect("/dashboard?forbidden=1")

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const term = await prisma.term.findFirst({
    where: { isCurrent: true, academicYear: { schoolId: session.user.schoolId } },
    select: { id: true, type: true, startDate: true, endDate: true, academicYear: { select: { name: true } } },
  })

  const [todayCounts, totalStudents, sections, termCounts, topAbsent, lastWeekCounts] = await Promise.all([
    prisma.attendance.groupBy({
      by: ["status"],
      where: { schoolId: session.user.schoolId, date: today, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.student.count({
      where: { schoolId: session.user.schoolId, deletedAt: null, status: "ACTIVE" },
    }),
    prisma.section.findMany({
      where: {
        schoolId: session.user.schoolId,
        deletedAt: null,
        enrollments: { some: { isActive: true, deletedAt: null } },
      },
      include: {
        class: { select: { name: true, level: true } },
        _count: {
          select: {
            enrollments: { where: { isActive: true, deletedAt: null } },
            attendance: { where: { date: today, deletedAt: null } },
          },
        },
      },
      orderBy: [{ class: { level: "asc" } }, { name: "asc" }],
    }),
    term
      ? prisma.attendance.groupBy({
          by: ["sectionId", "status"],
          where: { schoolId: session.user.schoolId, termId: term.id, deletedAt: null },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    term
      ? prisma.attendance.groupBy({
          by: ["studentId"],
          where: {
            schoolId: session.user.schoolId,
            termId: term.id,
            status: "ABSENT",
            deletedAt: null,
          },
          _count: { _all: true },
          orderBy: { _count: { studentId: "desc" } },
          take: 5,
        })
      : Promise.resolve([]),
    term
      ? prisma.attendance.groupBy({
          by: ["sectionId", "status"],
          where: {
            schoolId: session.user.schoolId,
            termId: term.id,
            deletedAt: null,
            date: { gte: dayjs(today).subtract(7, "day").toDate(), lt: today },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ])

  // Today's totals.
  const todayTotals = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
  for (const c of todayCounts) todayTotals[c.status] = c._count._all
  const todayMarked = todayTotals.PRESENT + todayTotals.ABSENT + todayTotals.LATE + todayTotals.EXCUSED
  const todayPct = pct(todayTotals.PRESENT, todayTotals.LATE, todayMarked)

  // Per-section term percentages.
  type Agg = { present: number; late: number; absent: number; excused: number }
  const termBySection = new Map<string, Agg>()
  for (const r of termCounts) {
    const a = termBySection.get(r.sectionId) ?? { present: 0, late: 0, absent: 0, excused: 0 }
    if (r.status === "PRESENT") a.present += r._count._all
    if (r.status === "LATE") a.late += r._count._all
    if (r.status === "ABSENT") a.absent += r._count._all
    if (r.status === "EXCUSED") a.excused += r._count._all
    termBySection.set(r.sectionId, a)
  }
  const lastWeekBySection = new Map<string, Agg>()
  for (const r of lastWeekCounts) {
    const a = lastWeekBySection.get(r.sectionId) ?? { present: 0, late: 0, absent: 0, excused: 0 }
    if (r.status === "PRESENT") a.present += r._count._all
    if (r.status === "LATE") a.late += r._count._all
    if (r.status === "ABSENT") a.absent += r._count._all
    if (r.status === "EXCUSED") a.excused += r._count._all
    lastWeekBySection.set(r.sectionId, a)
  }

  // Pending sections (not marked today).
  const pendingSections = sections.filter((s) => s._count.attendance === 0)

  // Most-absent students enriched.
  let topAbsentEnriched: Array<{
    studentId: string
    firstName: string
    lastName: string
    admissionNumber: string
    avatarUrl: string | null
    absences: number
    className: string | null
    sectionName: string | null
  }> = []
  if (topAbsent.length > 0) {
    const studs = await prisma.student.findMany({
      where: { id: { in: topAbsent.map((t) => t.studentId) } },
      include: {
        user: { select: { firstName: true, lastName: true, avatarUrl: true } },
        enrollments: {
          where: { isActive: true, deletedAt: null },
          take: 1,
          include: { class: { select: { name: true } }, section: { select: { name: true } } },
        },
      },
    })
    const map = new Map(studs.map((s) => [s.id, s]))
    topAbsentEnriched = topAbsent
      .map((t) => {
        const s = map.get(t.studentId)
        if (!s) return null
        return {
          studentId: s.id,
          firstName: s.user.firstName,
          lastName: s.user.lastName,
          admissionNumber: s.admissionNumber,
          avatarUrl: s.user.avatarUrl,
          absences: t._count._all,
          className: s.enrollments[0]?.class.name ?? null,
          sectionName: s.enrollments[0]?.section.name ?? null,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }

  // Per-class rollup for the class attendance table.
  type ClassRow = {
    sectionId: string
    label: string
    enrolled: number
    termPct: number | null
    lastWeekPct: number | null
  }
  const classRows: ClassRow[] = sections.map((s) => {
    const t = termBySection.get(s.id) ?? { present: 0, late: 0, absent: 0, excused: 0 }
    const w = lastWeekBySection.get(s.id) ?? { present: 0, late: 0, absent: 0, excused: 0 }
    const termTotal = t.present + t.late + t.absent + t.excused
    const wkTotal = w.present + w.late + w.absent + w.excused
    return {
      sectionId: s.id,
      label: `${s.class.name} · Arm ${s.name}`,
      enrolled: s._count.enrollments,
      termPct: pct(t.present, t.late, termTotal),
      lastWeekPct: pct(w.present, w.late, wkTotal),
    }
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">
            {term ? `${term.academicYear.name} · ${term.type[0] + term.type.slice(1).toLowerCase()} term` : "No active term"}
            {" · "}{dayjs(today).format("dddd, D MMM YYYY")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/attendance/ai-insights">
              <Sparkles className="mr-1.5 h-4 w-4 text-violet-600" />
              AI insights
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/attendance/reports">Reports</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/dashboard/attendance/mark">
              <ClipboardCheck className="mr-1.5 h-4 w-4" />
              Mark attendance
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Today&apos;s rate</p>
            <p className={cn("mt-1 text-3xl font-bold tabular-nums", tone(todayPct))}>
              {todayPct === null ? "—" : `${todayPct}%`}
            </p>
            <p className="text-xs text-muted-foreground">
              {todayMarked}/{totalStudents} marked
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Present today</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-600">
              {todayTotals.PRESENT.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              {todayTotals.LATE} late, {todayTotals.EXCUSED} excused
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Absent today</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-red-600">
              {todayTotals.ABSENT.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">SMS sent via queue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Classes pending</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-amber-600">
              {pendingSections.length}
            </p>
            <p className="text-xs text-muted-foreground">not marked today</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Class attendance this term</CardTitle>
            <CardDescription>
              Term % vs. previous 7 days &middot; trend arrow shows direction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {classRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active sections.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class · Arm</TableHead>
                    <TableHead className="text-right">Enrolled</TableHead>
                    <TableHead className="text-right">Term %</TableHead>
                    <TableHead className="text-right">Last 7 days</TableHead>
                    <TableHead className="text-right">Trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classRows.map((c) => {
                    const trend =
                      c.termPct !== null && c.lastWeekPct !== null
                        ? c.lastWeekPct - c.termPct
                        : null
                    return (
                      <TableRow key={c.sectionId}>
                        <TableCell className="text-sm">{c.label}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{c.enrolled}</TableCell>
                        <TableCell className={cn("text-right tabular-nums font-medium", tone(c.termPct))}>
                          {c.termPct === null ? "—" : `${c.termPct}%`}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums text-xs", tone(c.lastWeekPct))}>
                          {c.lastWeekPct === null ? "—" : `${c.lastWeekPct}%`}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {trend === null ? (
                            "—"
                          ) : trend > 1 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                              <TrendingUp className="h-3 w-3" />+{Math.round(trend)}
                            </span>
                          ) : trend < -1 ? (
                            <span className="inline-flex items-center gap-1 text-red-600">
                              <TrendingDown className="h-3 w-3" />
                              {Math.round(trend)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">±0</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                <AlertTriangle className="mr-1.5 inline h-4 w-4 text-amber-600" />
                Not marked today
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingSections.length === 0 ? (
                <p className="text-sm text-muted-foreground">Every class has been marked today.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {pendingSections.slice(0, 12).map((s) => (
                    <li key={s.id} className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1.5">
                      <span>
                        {s.class.name} · Arm {s.name}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        <Users className="mr-1 h-3 w-3" />
                        {s._count.enrollments}
                      </Badge>
                    </li>
                  ))}
                  {pendingSections.length > 12 && (
                    <li className="text-xs text-muted-foreground">
                      +{pendingSections.length - 12} more
                    </li>
                  )}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Most absent this term</CardTitle>
            </CardHeader>
            <CardContent>
              {topAbsentEnriched.length === 0 ? (
                <p className="text-sm text-muted-foreground">No absences recorded this term.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {topAbsentEnriched.map((s) => {
                    const initials = (s.firstName[0] ?? "") + (s.lastName[0] ?? "")
                    return (
                      <li key={s.studentId} className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5">
                        <Link href={`/dashboard/students/${s.studentId}`} className="flex items-center gap-2 hover:underline">
                          <Avatar className="h-7 w-7">
                            {s.avatarUrl ? <AvatarImage src={s.avatarUrl} alt="" /> : null}
                            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                          </Avatar>
                          <span>
                            <span className="block text-sm">{s.firstName} {s.lastName}</span>
                            <span className="block text-[10px] text-muted-foreground">
                              {s.className ? `${s.className} · Arm ${s.sectionName}` : "—"}
                            </span>
                          </span>
                        </Link>
                        <Badge variant="destructive" className="text-[10px]">
                          {s.absences} absent
                        </Badge>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {classRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Heatmap (last 30 days)</CardTitle>
            <CardDescription>
              Color = attendance rate that day. Green ≥ 90%, yellow 75–90%, red &lt; 75%.
              Toggle between class-level rollup and per-arm detail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AttendanceHeatmap
              sections={classRows.map((c) => ({ id: c.sectionId, label: c.label }))}
              classes={Array.from(
                new Map(
                  sections.map((s) => [s.classId, { id: s.classId, label: s.class.name }]),
                ).values(),
              )}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
