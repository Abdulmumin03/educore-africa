import Link from "next/link"
import dayjs from "dayjs"
import { Banknote, ClipboardCheck, GraduationCap, MessageSquare, UserCog } from "lucide-react"
import { prisma } from "@/lib/db"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AnnouncementsFeed } from "@/components/dashboard/my-profile/announcements-feed"
import { cn } from "@/lib/utils"

type ChildSummary = {
  studentId: string
  firstName: string
  lastName: string
  admissionNumber: string
  avatarUrl: string | null
  className: string | null
  sectionName: string | null
  attendancePercent: number | null
  presentDays: number
  totalDays: number
  balance: number
  lastGrade: {
    subject: string
    total: number
    termType: string
    sessionName: string
  } | null
}

async function loadChildren(parentUserId: string, schoolId: string): Promise<ChildSummary[]> {
  const parent = await prisma.parent.findUnique({
    where: { userId: parentUserId },
    select: { id: true },
  })
  if (!parent) return []

  const term = await prisma.term.findFirst({
    where: { isCurrent: true, academicYear: { schoolId } },
    select: { id: true },
  })

  const links = await prisma.studentParent.findMany({
    where: { parentId: parent.id },
    include: {
      student: {
        include: {
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
          enrollments: {
            where: { isActive: true, deletedAt: null },
            orderBy: { enrolledOn: "desc" },
            take: 1,
            include: { class: true, section: true },
          },
          feeInvoices: {
            where: { deletedAt: null },
            select: { amountDue: true, amountPaid: true },
          },
        },
      },
    },
  })

  const summaries = await Promise.all(
    links.map(async (link): Promise<ChildSummary> => {
      const s = link.student
      const att = term
        ? await prisma.attendance.groupBy({
            by: ["status"],
            where: { studentId: s.id, termId: term.id, deletedAt: null },
            _count: { _all: true },
          })
        : []

      const totalDays = att.reduce((acc, a) => acc + a._count._all, 0)
      const present = att.find((a) => a.status === "PRESENT")?._count._all ?? 0
      const late = att.find((a) => a.status === "LATE")?._count._all ?? 0
      const attendancePercent =
        totalDays === 0 ? null : Math.round(((present + late * 0.5) / totalDays) * 100)

      const balance = s.feeInvoices.reduce(
        (acc, inv) => acc + Math.max(0, Number(inv.amountDue) - Number(inv.amountPaid)),
        0,
      )

      const lastGrade = await prisma.grade.findFirst({
        where: { studentId: s.id, deletedAt: null },
        orderBy: { term: { startDate: "desc" } },
        include: {
          subject: { select: { name: true } },
          term: { select: { type: true, academicYear: { select: { name: true } } } },
        },
      })

      return {
        studentId: s.id,
        firstName: s.user.firstName,
        lastName: s.user.lastName,
        admissionNumber: s.admissionNumber,
        avatarUrl: s.user.avatarUrl,
        className: s.enrollments[0]?.class.name ?? null,
        sectionName: s.enrollments[0]?.section.name ?? null,
        attendancePercent,
        presentDays: present + late,
        totalDays,
        balance,
        lastGrade: lastGrade
          ? {
              subject: lastGrade.subject.name,
              total: Number(lastGrade.totalScore),
              termType: lastGrade.term.type,
              sessionName: lastGrade.term.academicYear.name,
            }
          : null,
      }
    }),
  )

  return summaries
}

export async function ParentDashboard({
  parentUserId,
  schoolId,
  firstName,
}: {
  parentUserId: string
  schoolId: string
  firstName: string
}) {
  const children = await loadChildren(parentUserId, schoolId)
  const totalOwed = children.reduce((acc, c) => acc + c.balance, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {firstName}.
        </h1>
        <p className="text-sm text-muted-foreground">
          {children.length === 0
            ? "No children linked to your account yet — ask the school office to attach you."
            : `You have ${children.length} child${children.length === 1 ? "" : "ren"} on record.`}
          {totalOwed > 0 && ` · Outstanding fees: ₦${totalOwed.toLocaleString()}.`}
        </p>
      </div>

      {children.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            My children
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {children.map((c) => (
              <ChildCard key={c.studentId} child={c} />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Announcements</CardTitle>
            <CardDescription>
              School updates relevant to you and your children.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AnnouncementsFeed />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick links</CardTitle>
            <CardDescription>Common things parents do here.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/students">
                <UserCog className="mr-1.5 h-4 w-4" />
                Manage children
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/messages">
                <MessageSquare className="mr-1.5 h-4 w-4" />
                Message teachers
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/finance">
                <Banknote className="mr-1.5 h-4 w-4" />
                Pay fees
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ChildCard({ child: c }: { child: ChildSummary }) {
  const initials = (c.firstName[0] ?? "") + (c.lastName[0] ?? "")
  const attendanceColor =
    c.attendancePercent === null
      ? "text-muted-foreground"
      : c.attendancePercent >= 90
        ? "text-emerald-600"
        : c.attendancePercent >= 75
          ? "text-amber-600"
          : "text-red-600"

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            {c.avatarUrl ? <AvatarImage src={c.avatarUrl} alt="" /> : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">
              {c.firstName} {c.lastName}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{c.admissionNumber}</span>
              {c.className && ` · ${c.className} · Arm ${c.sectionName ?? "—"}`}
            </p>
          </div>
          {c.balance > 0 && (
            <Badge variant="destructive" className="shrink-0">
              ₦{c.balance.toLocaleString()} due
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-3 pt-0 text-sm">
        <Stat
          icon={<ClipboardCheck className="h-3.5 w-3.5" />}
          label="Attendance"
          value={c.attendancePercent === null ? "—" : `${c.attendancePercent}%`}
          accent={attendanceColor}
          hint={c.totalDays > 0 ? `${c.presentDays}/${c.totalDays}` : "No data"}
        />
        <Stat
          icon={<GraduationCap className="h-3.5 w-3.5" />}
          label="Last grade"
          value={c.lastGrade ? String(Math.round(c.lastGrade.total)) : "—"}
          hint={c.lastGrade ? c.lastGrade.subject : "Not graded"}
        />
        <Stat
          icon={<Banknote className="h-3.5 w-3.5" />}
          label="Balance"
          value={c.balance === 0 ? "Settled" : `₦${c.balance.toLocaleString()}`}
          accent={c.balance > 0 ? "text-red-600" : "text-emerald-600"}
        />
      </CardContent>
      <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        <span>Updated {dayjs().format("D MMM YYYY")}</span>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/dashboard/students/${c.studentId}`}>View profile →</Link>
        </Button>
      </div>
    </Card>
  )
}

function Stat({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  accent?: string
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn("mt-0.5 text-base font-bold tabular-nums", accent)}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  )
}
