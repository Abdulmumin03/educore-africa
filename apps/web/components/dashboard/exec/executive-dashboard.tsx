"use client"

import dynamic from "next/dynamic"
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import {
  BookOpen,
  Calendar,
  CalendarPlus,
  ClipboardCheck,
  Megaphone,
  Send,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

// Recharts is lazy-loaded — keeps the dashboard's initial JS small.
const ExecCharts = dynamic(
  () => import("./executive-charts").then((m) => m.ExecutiveCharts),
  { ssr: false, loading: () => <ChartsSkeleton /> },
)

type ExecPayload = {
  school: { id: string; name: string; currency: string }
  kpis: {
    studentCount: number
    attendanceTodayPct: number | null
    feeCollectionPct: number | null
    staffPresentToday: number
    outstandingFees: number
  }
  enrollmentTrend: { months: string[]; thisYear: number[]; lastYear: number[] }
  feeDonut: { paid: number; partial: number; unpaid: number }
  attendanceByClass: {
    classId: string
    className: string
    presentPct: number | null
    total: number
  }[]
  recentPayments: {
    id: string
    amount: number
    paidAt: string
    studentName: string
    studentAdmission: string
    reference: string | null
  }[]
  upcomingEvents: { id: string; title: string; date: string; kind: "holiday" | "announcement" }[]
}

type Insight = {
  title: string
  description: string
  priority: "LOW" | "MEDIUM" | "HIGH"
  area: string
}

const ADMIN_ROLES = new Set(["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"])

export function ExecutiveDashboard({
  firstName,
  userRole,
}: {
  firstName: string
  userRole: string | null
}) {
  const greeting = useGreeting()
  const todayLabel = dayjs().format("dddd, D MMMM YYYY")
  const isAdmin = !!userRole && ADMIN_ROLES.has(userRole)

  const exec = useQuery<ExecPayload>({
    queryKey: ["dashboard-exec"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/exec")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const insights = useQuery<{ items: Insight[]; cached?: boolean }>({
    queryKey: ["dashboard-ai-insights"],
    queryFn: async () => {
      const res = await fetch("/api/ai/school-insights")
      if (!res.ok) {
        // 403 for non-admins is fine — return empty.
        if (res.status === 403) return { items: [] }
        throw new Error("Failed")
      }
      return res.json()
    },
    enabled: isAdmin,
    // Slower endpoint — don't refetch in background.
    staleTime: 60 * 60 * 1000,
  })

  const currency = exec.data?.school.currency ?? "NGN"
  const formatMoney = useMemo(
    () =>
      new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format,
    [currency],
  )

  return (
    <div className="space-y-5 pb-24">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}, {firstName}.
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s your school summary for {todayLabel}.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          icon={Users}
          label="Total students"
          value={exec.data ? exec.data.kpis.studentCount.toLocaleString() : null}
          loading={exec.isLoading}
        />
        <KpiCard
          icon={ClipboardCheck}
          label="Attendance today"
          value={
            exec.data?.kpis.attendanceTodayPct === null
              ? "—"
              : exec.data
                ? `${exec.data.kpis.attendanceTodayPct}%`
                : null
          }
          loading={exec.isLoading}
        />
        <KpiCard
          icon={Wallet}
          label="Fee collection"
          value={
            exec.data?.kpis.feeCollectionPct === null
              ? "—"
              : exec.data
                ? `${exec.data.kpis.feeCollectionPct}%`
                : null
          }
          loading={exec.isLoading}
        />
        <KpiCard
          icon={BookOpen}
          label="Staff present today"
          value={exec.data ? exec.data.kpis.staffPresentToday.toLocaleString() : null}
          loading={exec.isLoading}
        />
        <KpiCard
          icon={TrendingUp}
          label="Outstanding fees"
          value={exec.data ? formatMoney(exec.data.kpis.outstandingFees) : null}
          loading={exec.isLoading}
          tone={
            exec.data && exec.data.kpis.outstandingFees > 0 ? "warning" : "default"
          }
        />
      </div>

      {/* Charts row */}
      {exec.data ? (
        <ExecCharts
          enrollmentTrend={exec.data.enrollmentTrend}
          feeDonut={exec.data.feeDonut}
          attendanceByClass={exec.data.attendanceByClass}
        />
      ) : (
        <ChartsSkeleton />
      )}

      {/* Activity feed */}
      <div className="grid gap-3 lg:grid-cols-2">
        <AttendanceByClass data={exec.data?.attendanceByClass ?? []} loading={exec.isLoading} />
        <RecentPayments
          data={exec.data?.recentPayments ?? []}
          loading={exec.isLoading}
          formatMoney={formatMoney}
        />
      </div>

      {/* AI Insights */}
      {isAdmin && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">AI insights for this week</h2>
          </div>
          {insights.isLoading ? (
            <div className="grid gap-3 lg:grid-cols-3">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
          ) : (insights.data?.items ?? []).length === 0 ? (
            <Card>
              <CardContent className="p-4 text-xs text-muted-foreground">
                No insights right now. Configure the AI key (or wait for more data) to populate this card.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-3">
              {insights.data!.items.slice(0, 3).map((i, idx) => (
                <InsightCard key={idx} item={i} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Upcoming events */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Upcoming</h2>
        </div>
        <UpcomingEvents data={exec.data?.upcomingEvents ?? []} loading={exec.isLoading} />
      </section>

      {/* Quick actions floating bar */}
      {isAdmin && <QuickActionsBar />}
    </div>
  )
}

function useGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

function KpiCard({
  icon: Icon,
  label,
  value,
  loading,
  tone,
}: {
  icon: typeof Users
  label: string
  value: string | null
  loading: boolean
  tone?: "warning" | "default"
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p
            className={
              tone === "warning"
                ? "text-2xl font-bold text-amber-600"
                : "text-2xl font-bold"
            }
          >
            {value ?? "—"}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function ChartsSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
      <Skeleton className="h-72" />
      <Skeleton className="h-72" />
    </div>
  )
}

function AttendanceByClass({
  data,
  loading,
}: {
  data: ExecPayload["attendanceByClass"]
  loading: boolean
}) {
  if (loading) return <Skeleton className="h-56" />
  const hasData = data.some((r) => r.total > 0)
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Today&apos;s attendance by class
        </p>
        {!hasData ? (
          <p className="text-xs text-muted-foreground">No attendance marked yet today.</p>
        ) : (
          <ul className="space-y-1.5">
            {data
              .filter((r) => r.total > 0)
              .map((r) => (
                <li key={r.classId} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{r.className}</span>
                    <span className="text-muted-foreground">
                      {r.presentPct}% ({r.total})
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded bg-muted">
                    <div
                      className={
                        (r.presentPct ?? 0) >= 85
                          ? "h-full bg-emerald-500"
                          : (r.presentPct ?? 0) >= 70
                            ? "h-full bg-amber-500"
                            : "h-full bg-red-500"
                      }
                      style={{ width: `${r.presentPct ?? 0}%` }}
                    />
                  </div>
                </li>
              ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function RecentPayments({
  data,
  loading,
  formatMoney,
}: {
  data: ExecPayload["recentPayments"]
  loading: boolean
  formatMoney: (n: number) => string
}) {
  if (loading) return <Skeleton className="h-56" />
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent payments
        </p>
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground">No recent payments.</p>
        ) : (
          <ul className="divide-y">
            {data.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 py-1.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.studentName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {p.studentAdmission}
                    {p.reference && ` · ${p.reference}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatMoney(p.amount)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {dayjs(p.paidAt).format("D MMM · HH:mm")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function InsightCard({ item }: { item: Insight }) {
  const tone =
    item.priority === "HIGH"
      ? "border-red-300 bg-red-50"
      : item.priority === "MEDIUM"
        ? "border-amber-300 bg-amber-50"
        : "border-input"
  const href = areaToHref(item.area)
  return (
    <Card className={tone}>
      <CardContent className="space-y-1.5 p-3">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-[10px]">
            {item.area}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {item.priority}
          </Badge>
        </div>
        <h3 className="text-sm font-semibold">{item.title}</h3>
        <p className="text-xs">{item.description}</p>
        {href && (
          <Button asChild variant="ghost" size="sm" className="px-0">
            <a href={href}>Take action →</a>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function areaToHref(area: string): string | null {
  switch (area) {
    case "ATTENDANCE":
      return "/dashboard/attendance"
    case "ACADEMICS":
      return "/dashboard/ai"
    case "FINANCE":
      return "/dashboard/finance"
    case "BEHAVIOR":
      return "/dashboard/ai"
    case "WELLBEING":
      return "/dashboard/students"
    case "OPERATIONS":
      return "/dashboard/communications/analytics"
    default:
      return null
  }
}

function UpcomingEvents({
  data,
  loading,
}: {
  data: ExecPayload["upcomingEvents"]
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="space-y-1.5">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    )
  }
  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground">
          Nothing scheduled in the next few days.
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y">
          {data.map((e) => (
            <li key={e.id} className="flex items-center gap-3 p-3 text-sm">
              <div
                className={
                  e.kind === "holiday"
                    ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700"
                    : "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700"
                }
              >
                {e.kind === "holiday" ? (
                  <CalendarPlus className="h-4 w-4" />
                ) : (
                  <Megaphone className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{e.title}</p>
                <p className="text-[11px] uppercase text-muted-foreground">
                  {e.kind}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {dayjs(e.date).format("D MMM YYYY")}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function QuickActionsBar() {
  return (
    <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur">
      <div className="flex items-center gap-1">
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <a href="/dashboard/students/new">
            <UserPlus className="mr-1.5 h-4 w-4" />
            Add student
          </a>
        </Button>
        <span className="h-4 w-px bg-border" />
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <a href="/dashboard/attendance">
            <ClipboardCheck className="mr-1.5 h-4 w-4" />
            Mark attendance
          </a>
        </Button>
        <span className="h-4 w-px bg-border" />
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <a href="/dashboard/finance">
            <Wallet className="mr-1.5 h-4 w-4" />
            Collect payment
          </a>
        </Button>
        <span className="h-4 w-px bg-border" />
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <a href="/dashboard/announcements">
            <Send className="mr-1.5 h-4 w-4" />
            Send announcement
          </a>
        </Button>
      </div>
    </div>
  )
}

