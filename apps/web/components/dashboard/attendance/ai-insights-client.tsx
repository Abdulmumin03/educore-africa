"use client"

import Link from "next/link"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Loader2, MessageSquare, Sparkles, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type RiskItem = {
  studentId: string
  name: string
  className: string | null
  currentPct: number
  predictedPct: number
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  recommendation: string
}

type RiskResponse = {
  items: RiskItem[]
  model: string
  term: { id: string; elapsedDays: number; totalDays: number } | null
  note?: string
}

function badgeVariant(level: string): "default" | "secondary" | "destructive" | "outline" {
  if (level === "CRITICAL") return "destructive"
  if (level === "HIGH") return "destructive"
  if (level === "MEDIUM") return "secondary"
  return "outline"
}

function tone(p: number) {
  if (p >= 90) return "text-emerald-600"
  if (p >= 75) return "text-amber-600"
  return "text-red-600"
}

export function AiInsightsClient() {
  const { data, isLoading, isFetching, refetch } = useQuery<RiskResponse>({
    queryKey: ["attendance-risk"],
    queryFn: async () => {
      const res = await fetch("/api/ai/attendance-risk")
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json()
    },
    refetchOnWindowFocus: false,
  })

  const contact = useMutation({
    mutationFn: async (studentId: string) => {
      const res = await fetch("/api/attendance/contact-parent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json()
    },
    onSuccess: () => toast.success("Parent notified via SMS"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <Sparkles className="mr-1.5 inline h-5 w-5 text-violet-600" />
            At-risk attendance
          </h1>
          <p className="text-sm text-muted-foreground">
            AI prediction of which students will fall below 75% attendance by end of term.
            {data?.term && (
              <span>
                {" "}
                Term progress: {data.term.elapsedDays}/{data.term.totalDays} days.
              </span>
            )}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Computing risk…
        </div>
      ) : !data || data.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">No students at risk right now</p>
            <p className="text-xs text-muted-foreground">
              {data?.note ??
                "Either everyone is comfortably above 80%, or there isn't enough data yet this term."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.items.map((item) => (
            <Card key={item.studentId}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-base">
                    <Link href={`/dashboard/students/${item.studentId}`} className="hover:underline">
                      {item.name}
                    </Link>
                  </CardTitle>
                  <CardDescription>{item.className ?? "—"}</CardDescription>
                </div>
                <Badge variant={badgeVariant(item.riskLevel)}>
                  <TriangleAlert className="mr-1 h-3 w-3" />
                  {item.riskLevel}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Kpi label="Current" value={`${item.currentPct}%`} accent={tone(item.currentPct)} />
                  <Kpi label="Predicted EOT" value={`${item.predictedPct}%`} accent={tone(item.predictedPct)} />
                  <Kpi label="Risk" value={item.riskLevel} accent={
                    item.riskLevel === "CRITICAL" ? "text-red-600" :
                    item.riskLevel === "HIGH" ? "text-amber-600" :
                    "text-muted-foreground"
                  } />
                  <div className="flex items-end justify-end gap-2 sm:col-span-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => contact.mutate(item.studentId)}
                      disabled={contact.isPending}
                    >
                      {contact.isPending ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <MessageSquare className="mr-1.5 h-4 w-4" />
                      )}
                      Contact parent
                    </Button>
                  </div>
                </div>
                <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3 text-sm">
                  <p className="text-[10px] font-semibold uppercase text-violet-700">
                    Recommendation
                  </p>
                  <p>{item.recommendation}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && (
        <p className="text-[10px] text-muted-foreground">
          Generated via {data.model}
          {data.note ? ` · ${data.note}` : ""}.
        </p>
      )}
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold tabular-nums", accent)}>{value}</p>
    </div>
  )
}
