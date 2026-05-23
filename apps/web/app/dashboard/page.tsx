import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, ClipboardCheck, Banknote, Bot } from "lucide-react"
import { ParentDashboard } from "@/components/dashboard/parent/parent-dashboard"

export const metadata = { title: "Dashboard · EduCore Africa" }

const QUICK_TILES = [
  { href: "/dashboard/students", icon: Users, label: "Students" },
  { href: "/dashboard/attendance", icon: ClipboardCheck, label: "Attendance" },
  { href: "/dashboard/finance", icon: Banknote, label: "Finance" },
  { href: "/dashboard/ai", icon: Bot, label: "AI Insights" },
]

export default async function DashboardHome() {
  const session = await auth()
  const schoolId = session?.user.schoolId

  // Parents get a child-scoped view — don't leak school-wide counts.
  if (session?.user.role === "PARENT" && schoolId) {
    return (
      <ParentDashboard
        parentUserId={session.user.id}
        schoolId={schoolId}
        firstName={session.user.name?.split(" ")[0] ?? "there"}
      />
    )
  }

  // Best-effort counts: fall back to zero if not provisioned yet.
  const [studentCount, staffCount, openInvoices] = schoolId
    ? await Promise.all([
        prisma.student.count({ where: { schoolId, deletedAt: null } }),
        prisma.staff.count({ where: { schoolId, deletedAt: null } }),
        prisma.feeInvoice.count({
          where: { schoolId, status: { in: ["PENDING", "PARTIAL", "OVERDUE"] }, deletedAt: null },
        }),
      ])
    : [0, 0, 0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {session?.user.name?.split(" ")[0] ?? "there"}.
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s a snapshot of your school today.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active students</CardDescription>
            <CardTitle className="text-3xl">{studentCount.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Enrolled this academic year.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active staff</CardDescription>
            <CardTitle className="text-3xl">{staffCount.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Teachers, admins, and support roles.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open fee invoices</CardDescription>
            <CardTitle className="text-3xl">{openInvoices.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Pending, partial, or overdue.
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Quick links
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {QUICK_TILES.map(({ href, icon: Icon, label }) => (
            <a
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg border bg-card p-4 transition hover:border-primary/40 hover:bg-primary/5"
            >
              <Icon className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">{label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
