"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Download, Loader2, RefreshCcw, Sparkles, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type RiskRow = {
  id: string
  studentId: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  admissionNumber: string
  className: string | null
  sectionName: string | null
  score: number
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  recommendation: string | null
  attendanceScore: number | null
  gradeScore: number | null
  behaviorScore: number | null
  engagementScore: number | null
  trendScore: number | null
  computedAt: string
}

type ListResponse = {
  items: RiskRow[]
  summary: Record<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL", number>
  lastRun: string | null
  model: string | null
}

const LEVEL_VARIANT: Record<RiskRow["level"], "default" | "secondary" | "destructive" | "outline"> = {
  LOW: "outline",
  MEDIUM: "secondary",
  HIGH: "destructive",
  CRITICAL: "destructive",
}

function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function AtRiskClient({ canRun }: { canRun: boolean }) {
  const qc = useQueryClient()
  const [level, setLevel] = useState<string>("__all__")

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    if (level !== "__all__") p.set("level", level)
    return p.toString()
  }, [level])

  const list = useQuery<ListResponse>({
    queryKey: ["at-risk", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/ai/at-risk?${queryString}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const run = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai/at-risk/run", { method: "POST" })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ scored: number; model: string }>
    },
    onSuccess: (d) => {
      toast.success(`Scored ${d.scored} student${d.scored === 1 ? "" : "s"} via ${d.model}`)
      qc.invalidateQueries({ queryKey: ["at-risk", queryString] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  function exportCsv() {
    if (!list.data) return
    const rows: (string | number | null)[][] = [
      [
        "Admission no.",
        "Name",
        "Class",
        "Risk score",
        "Risk level",
        "Attendance",
        "Grade",
        "Behavior",
        "Engagement",
        "Trend",
        "Recommendation",
      ],
      ...list.data.items.map((r) => [
        r.admissionNumber,
        `${r.firstName} ${r.lastName}`,
        r.className ? `${r.className} · ${r.sectionName}` : "",
        r.score,
        r.level,
        r.attendanceScore,
        r.gradeScore,
        r.behaviorScore,
        r.engagementScore,
        r.trendScore,
        r.recommendation,
      ]),
    ]
    downloadCsv("at-risk-students.csv", rows)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <Sparkles className="mr-1.5 inline h-5 w-5 text-violet-600" />
            At-risk students
          </h1>
          <p className="text-sm text-muted-foreground">
            {list.data?.lastRun
              ? `Last computed ${dayjs(list.data.lastRun).fromNow?.() ?? dayjs(list.data.lastRun).format("D MMM HH:mm")} via ${list.data.model ?? "n/a"}.`
              : "No scores computed yet — run the analyser."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!list.data?.items.length}>
            <Download className="mr-1.5 h-4 w-4" /> CSV
          </Button>
          {canRun && (
            <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-1.5 h-4 w-4" />
              )}
              Run analyser
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Low" count={list.data?.summary.LOW ?? 0} accent="text-emerald-600" />
        <SummaryTile label="Medium" count={list.data?.summary.MEDIUM ?? 0} accent="text-amber-600" />
        <SummaryTile label="High" count={list.data?.summary.HIGH ?? 0} accent="text-orange-600" />
        <SummaryTile label="Critical" count={list.data?.summary.CRITICAL ?? 0} accent="text-red-600" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Students</CardTitle>
          <CardDescription>
            Sortable by risk score. Recommendations are AI-drafted (or heuristic fallback if Claude isn&apos;t configured).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 w-48">
            <Label className="text-xs">Risk level</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All levels</SelectItem>
                <SelectItem value="CRITICAL">Critical</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {list.isLoading && !list.data ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !list.data || list.data.items.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">
              {list.data?.lastRun
                ? "No students match this filter."
                : "Run the analyser to populate scores."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Risk</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead className="text-right">Attendance</TableHead>
                  <TableHead className="text-right">Grade</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead className="w-16 text-right">Profile</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((r) => {
                  const initials = (r.firstName[0] ?? "") + (r.lastName[0] ?? "")
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            {r.avatarUrl ? <AvatarImage src={r.avatarUrl} alt="" /> : null}
                            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                          </Avatar>
                          <span>
                            <span className="block text-sm font-medium">
                              {r.firstName} {r.lastName}
                            </span>
                            <span className="block font-mono text-[10px] text-muted-foreground">
                              {r.admissionNumber}
                            </span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.className ? `${r.className} · ${r.sectionName}` : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono text-sm font-bold tabular-nums",
                          r.score >= 80
                            ? "text-red-600"
                            : r.score >= 55
                              ? "text-orange-600"
                              : r.score >= 30
                                ? "text-amber-600"
                                : "text-emerald-600",
                        )}
                      >
                        {r.score}
                      </TableCell>
                      <TableCell>
                        <Badge variant={LEVEL_VARIANT[r.level]} className="text-[10px]">
                          {r.level === "CRITICAL" || r.level === "HIGH" ? (
                            <TriangleAlert className="mr-1 h-3 w-3" />
                          ) : null}
                          {r.level}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {r.attendanceScore !== null ? `${r.attendanceScore}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {r.gradeScore !== null ? `${r.gradeScore}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{r.recommendation ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/dashboard/students/${r.studentId}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryTile({ label, count, accent }: { label: string; count: number; accent: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-bold tabular-nums", accent)}>{count.toLocaleString()}</p>
      </CardContent>
    </Card>
  )
}
