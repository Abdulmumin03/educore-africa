import Link from "next/link"
import dayjs from "dayjs"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AnnouncementsFeed } from "@/components/dashboard/my-profile/announcements-feed"
import { NotificationPrefs } from "@/components/dashboard/my-profile/notification-prefs"

export const metadata = { title: "My profile · EduCore Africa" }

const STAFF_ROLES = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "BURSAR",
  "COUNSELOR",
  "LIBRARIAN",
  "HOSTEL_MASTER",
  "DRIVER",
]

export default async function MyProfilePage() {
  const session = await auth()
  if (!session?.user) redirect("/auth/login")
  if (!session.user.schoolId) redirect("/dashboard")

  // Staff land on their own staff profile.
  if (STAFF_ROLES.includes(session.user.role)) {
    const me = await prisma.staff.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (me) redirect(`/dashboard/staff/${me.id}`)
    redirect("/dashboard")
  }

  if (session.user.role !== "STUDENT") redirect("/dashboard")

  const student = await prisma.student.findUnique({
    where: { userId: session.user.id },
    include: {
      user: { select: { firstName: true, lastName: true, avatarUrl: true } },
      enrollments: {
        where: { isActive: true, deletedAt: null },
        orderBy: { enrolledOn: "desc" },
        take: 1,
        include: { class: true, section: true, academicYear: true },
      },
      feeInvoices: { where: { deletedAt: null }, orderBy: { dueDate: "desc" } },
    },
  })

  if (!student) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-12 text-center">
        <p className="text-sm font-medium">No student record linked</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ask your school administrator to attach your account to a student profile.
        </p>
      </div>
    )
  }

  // Attendance summary (this term).
  const term = await prisma.term.findFirst({
    where: { isCurrent: true, academicYear: { schoolId: session.user.schoolId } },
    select: { id: true, startDate: true, endDate: true },
  })
  const att = term
    ? await prisma.attendance.groupBy({
        by: ["status"],
        where: {
          studentId: student.id,
          termId: term.id,
          deletedAt: null,
        },
        _count: { _all: true },
      })
    : []

  const totalDays = att.reduce((acc, a) => acc + a._count._all, 0)
  const present = att.find((a) => a.status === "PRESENT")?._count._all ?? 0
  const late = att.find((a) => a.status === "LATE")?._count._all ?? 0
  const percent = totalDays === 0 ? 100 : Math.round(((present + late * 0.5) / totalDays) * 100)

  const lastGrade = await prisma.grade.findFirst({
    where: { studentId: student.id, deletedAt: null },
    orderBy: { term: { startDate: "desc" } },
    include: { subject: { select: { name: true } } },
  })

  const balance = student.feeInvoices.reduce(
    (acc, inv) => acc + Math.max(0, Number(inv.amountDue) - Number(inv.amountPaid)),
    0,
  )

  const initials =
    (student.user.firstName[0] ?? "") + (student.user.lastName[0] ?? "")

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center gap-4 p-5">
          <Avatar className="h-16 w-16">
            {student.user.avatarUrl ? (
              <AvatarImage src={student.user.avatarUrl} alt="" />
            ) : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {student.user.firstName} {student.user.lastName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono text-xs">{student.admissionNumber}</span>
              {student.enrollments[0] && (
                <>
                  <span>·</span>
                  <span>
                    {student.enrollments[0].class.name} · Arm {student.enrollments[0].section.name}
                  </span>
                </>
              )}
              <Badge variant="secondary">
                {student.status[0] + student.status.slice(1).toLowerCase()}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Attendance" value={`${percent}%`} />
        <KpiCard
          label="Last grade"
          value={
            lastGrade
              ? `${lastGrade.subject.name}: ${lastGrade.totalScore}`
              : "—"
          }
        />
        <KpiCard
          label="Fee balance"
          value={balance > 0 ? `₦${balance.toLocaleString()}` : "Settled"}
          accent={balance > 0 ? "text-destructive" : "text-emerald-600"}
        />
        <KpiCard
          label="Next class"
          value={student.enrollments[0]?.class.name ?? "—"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick links</CardTitle>
            <CardDescription>Everything you need this week.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/timetable">View timetable</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/grades">Check results</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/assignments">Assignments</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Announcements</CardTitle>
            <CardDescription>
              School-wide updates appear here as they&apos;re posted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AnnouncementsFeed />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification preferences</CardTitle>
          <CardDescription>
            Choose which channels we use to send you alerts, results, and reminders.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationPrefs />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Last updated · {dayjs().format("D MMM YYYY")}
      </p>
    </div>
  )
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-bold tabular-nums ${accent ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
