"use client"

import Link from "next/link"
import { useMutation, useQueries } from "@tanstack/react-query"
import dayjs from "dayjs"
import {
  Calendar,
  ClipboardCheck,
  FileBarChart,
  Loader2,
  MessageCircle,
  RefreshCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type AtRiskItem = {
  studentId: string
  firstName: string
  lastName: string
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  score: number
}

type AtRiskResponse = {
  items: AtRiskItem[]
  summary: Record<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL", number>
  lastRun: string | null
}

type AttendanceRiskResponse = {
  items: { studentId: string; name: string; currentPct: number; riskLevel: string }[]
}

type InsightsResponse = {
  aggregates: {
    term: { label: string }
    attendance: { pct: number | null }
    grades: { average: number | null }
    fees: { collectionPct: number | null }
    incidents: number
    atRiskStudents: number
  }
  recommendations: { title: string; description: string; priority: "LOW" | "MEDIUM" | "HIGH"; area: string }[]
  model: string
  generatedAt: string
}

function fetcher<T>(url: string): () => Promise<T> {
  return async () => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed: ${url}`)
    return res.json() as Promise<T>
  }
}

export function AiDashboardClient({ canSeeInsights }: { canSeeInsights: boolean }) {
  const queries = useQueries({
    queries: [
      { queryKey: ["ai-at-risk-summary"], queryFn: fetcher<AtRiskResponse>("/api/ai/at-risk") },
      { queryKey: ["ai-attendance-risk-summary"], queryFn: fetcher<AttendanceRiskResponse>("/api/ai/attendance-risk") },
      {
        queryKey: ["ai-school-insights"],
        queryFn: fetcher<InsightsResponse>("/api/ai/school-insights"),
        enabled: canSeeInsights,
      },
    ],
  })
  const [atRisk, attendance, insights] = queries

  const refresh = useMutation({
    mutationFn: async () => {
      const tasks: Promise<unknown>[] = [fetch("/api/ai/at-risk/run", { method: "POST" })]
      if (canSeeInsights) tasks.push(fetch("/api/ai/school-insights?refresh=1"))
      await Promise.allSettled(tasks)
    },
    onSuccess: () => {
      toast.success("Re-ran AI jobs")
      queries.forEach((q) => q.refetch())
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const lastUpdated = insights.data?.generatedAt ?? atRisk.data?.lastRun ?? null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <Sparkles className="mr-1.5 inline h-5 w-5 text-violet-600" />
            AI Insights
          </h1>
          <p className="text-sm text-muted-foreground">
            {insights.data?.aggregates.term.label
              ? `${insights.data.aggregates.term.label} · `
              : ""}
            {lastUpdated
              ? `last updated ${dayjs(lastUpdated).fromNow?.() ?? dayjs(lastUpdated).format("D MMM HH:mm")}`
              : "no data yet — refresh to populate"}
          </p>
        </div>
        <Button size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          {refresh.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="mr-1.5 h-4 w-4" />
          )}
          Refresh all insights
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AtRiskCard data={atRisk.data} loading={atRisk.isLoading} />
        <AttendanceCard data={attendance.data} loading={attendance.isLoading} />
        {canSeeInsights && (
          <RecommendationsCard data={insights.data} loading={insights.isLoading} />
        )}
        <QuickActionsCard />
      </div>
    </div>
  )
}

function AtRiskCard({ data, loading }: { data?: AtRiskResponse; loading: boolean }) {
  const total = data ? data.summary.HIGH + data.summary.CRITICAL : 0
  const preview = data?.items.filter((i) => i.level === "HIGH" || i.level === "CRITICAL").slice(0, 3) ?? []
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>
            <TriangleAlert className="mr-1.5 inline h-4 w-4 text-amber-600" />
            At-risk students
          </span>
          <Badge variant={total > 0 ? "destructive" : "outline"}>{total}</Badge>
        </CardTitle>
        <CardDescription>HIGH or CRITICAL risk on the latest run.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : preview.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            No high-risk students — run the analyser to refresh.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {preview.map((s) => (
              <li key={s.studentId} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-1.5">
                <Link href={`/dashboard/students/${s.studentId}`} className="hover:underline">
                  {s.firstName} {s.lastName}
                </Link>
                <Badge variant="destructive" className="text-[10px]">
                  {s.level} · {s.score}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <Button size="sm" variant="ghost" asChild>
          <Link href="/dashboard/ai/at-risk">View full report →</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function AttendanceCard({
  data,
  loading,
}: {
  data?: AttendanceRiskResponse
  loading: boolean
}) {
  const below = data?.items.filter((i) => i.currentPct < 75) ?? []
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>
            <ClipboardCheck className="mr-1.5 inline h-4 w-4 text-amber-600" />
            Attendance alerts
          </span>
          <Badge variant={below.length > 0 ? "secondary" : "outline"}>{below.length}</Badge>
        </CardTitle>
        <CardDescription>Students currently below 75% this term.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : below.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">Everyone is above 75% — great.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {below.slice(0, 3).map((s) => (
              <li key={s.studentId} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-1.5">
                <Link href={`/dashboard/students/${s.studentId}`} className="hover:underline">
                  {s.name}
                </Link>
                <Badge variant="secondary" className="text-[10px]">{s.currentPct}%</Badge>
              </li>
            ))}
          </ul>
        )}
        <Button size="sm" variant="ghost" asChild>
          <Link href="/dashboard/attendance/ai-insights">View full report →</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function RecommendationsCard({
  data,
  loading,
}: {
  data?: InsightsResponse
  loading: boolean
}) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          <Sparkles className="mr-1.5 inline h-4 w-4 text-violet-600" />
          AI recommendations
        </CardTitle>
        <CardDescription>
          Three actions the principal could take this week.
          {data?.aggregates && (
            <span className="ml-2">
              Attendance {data.aggregates.attendance.pct ?? "—"}% · Avg grade{" "}
              {data.aggregates.grades.average ?? "—"} · Fees{" "}
              {data.aggregates.fees.collectionPct ?? "—"}% · Incidents {data.aggregates.incidents}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : !data || data.recommendations.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">No recommendations yet.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-3">
            {data.recommendations.map((r, i) => (
              <li
                key={i}
                className={cn(
                  "rounded-md border p-3 text-sm",
                  r.priority === "HIGH"
                    ? "border-red-500/30 bg-red-500/5"
                    : r.priority === "MEDIUM"
                      ? "border-amber-500/30 bg-amber-500/5"
                      : "border-muted bg-muted/30",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{r.title}</p>
                  <Badge variant="outline" className="text-[9px]">{r.area}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
              </li>
            ))}
          </ul>
        )}
        {data && (
          <p className="mt-2 text-[10px] text-muted-foreground">Generated via {data.model}.</p>
        )}
      </CardContent>
    </Card>
  )
}

function QuickActionsCard() {
  const actions = [
    {
      href: "/dashboard/ai/ask",
      icon: MessageCircle,
      title: "Ask EduCore",
      description: "Natural-language Q&A about your school data.",
    },
    {
      href: "/dashboard/ai/timetable",
      icon: Calendar,
      title: "AI timetable",
      description: "Generate a weekly schedule from constraints.",
    },
    {
      href: "/dashboard/ai/question-bank",
      icon: FileBarChart,
      title: "Question bank",
      description: "WAEC-style exam questions on demand.",
    },
  ]
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Other AI tools</CardTitle>
        <CardDescription>Jump straight in.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-3">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="rounded-md border bg-card p-3 transition hover:border-primary/40 hover:bg-primary/5"
          >
            <a.icon className="h-4 w-4 text-primary" />
            <p className="mt-2 text-sm font-semibold">{a.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
