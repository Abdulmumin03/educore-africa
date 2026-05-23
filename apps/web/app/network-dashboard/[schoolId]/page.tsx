import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, ClipboardCheck, School, TrendingUp, Users, Wallet } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Card, CardContent } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export default async function NetworkSchoolPage({
  params,
}: {
  params: { schoolId: string }
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "SUPER_ADMIN") redirect("/dashboard")

  const school = await prisma.school.findFirst({
    where: { id: params.schoolId, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      country: true,
      currency: true,
      phone: true,
      email: true,
    },
  })
  if (!school) notFound()

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const [students, staff, attendance, invoiceAgg, recentPayments, holidays] =
    await Promise.all([
      prisma.student.count({
        where: { schoolId: school.id, deletedAt: null, status: "ACTIVE" },
      }),
      prisma.staff.count({
        where: { schoolId: school.id, deletedAt: null, status: "ACTIVE" },
      }),
      prisma.attendance.groupBy({
        by: ["status"],
        where: {
          schoolId: school.id,
          deletedAt: null,
          date: { gte: since },
        },
        _count: { _all: true },
      }),
      prisma.feeInvoice.aggregate({
        where: { schoolId: school.id, deletedAt: null },
        _sum: { amountDue: true, amountPaid: true },
      }),
      prisma.payment.findMany({
        where: { schoolId: school.id, deletedAt: null },
        orderBy: { paidAt: "desc" },
        take: 5,
        include: {
          invoice: {
            select: {
              student: {
                select: {
                  admissionNumber: true,
                  user: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      }),
      prisma.holiday.findMany({
        where: { schoolId: school.id, deletedAt: null, endDate: { gte: new Date() } },
        orderBy: { startDate: "asc" },
        take: 5,
        select: { id: true, name: true, startDate: true },
      }),
    ])

  const present = attendance.find((a) => a.status === "PRESENT")?._count._all ?? 0
  const total = attendance.reduce((s, a) => s + a._count._all, 0)
  const attendancePct = total > 0 ? Math.round((present / total) * 100) : null
  const billed = Number(invoiceAgg._sum.amountDue ?? 0)
  const paid = Number(invoiceAgg._sum.amountPaid ?? 0)
  const outstanding = Math.max(0, billed - paid)
  const ratePct = billed > 0 ? Math.round((paid / billed) * 100) : null

  const money = (n: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: school.currency,
      maximumFractionDigits: 0,
    }).format(n)

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <Link
          href="/network-dashboard"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to network
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight">
          <School className="h-6 w-6 text-primary" />
          {school.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {[school.city, school.country].filter(Boolean).join(", ")}
          {school.phone && ` · ${school.phone}`}
          {school.email && ` · ${school.email}`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Read-only network view. Use the school&apos;s own login to make changes.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat icon={Users} label="Students (active)" value={students.toLocaleString()} />
        <Stat icon={Users} label="Staff (active)" value={staff.toLocaleString()} />
        <Stat
          icon={ClipboardCheck}
          label="Attendance (30d)"
          value={attendancePct === null ? "—" : `${attendancePct}%`}
        />
        <Stat
          icon={Wallet}
          label="Fee collection"
          value={ratePct === null ? "—" : `${ratePct}%`}
        />
        <Stat
          icon={TrendingUp}
          label="Outstanding"
          value={money(outstanding)}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent payments
            </p>
            {recentPayments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No recent payments.</p>
            ) : (
              <ul className="divide-y">
                {recentPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {p.invoice.student.user.firstName} {p.invoice.student.user.lastName}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.invoice.student.admissionNumber}
                      </p>
                    </div>
                    <span className="font-semibold">{money(Number(p.amount))}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Upcoming holidays
            </p>
            {holidays.length === 0 ? (
              <p className="text-xs text-muted-foreground">No holidays scheduled.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {holidays.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>{h.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {h.startDate.toISOString().slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users
  label: string
  value: string
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}
