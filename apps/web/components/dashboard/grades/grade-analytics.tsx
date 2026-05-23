"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts"
import { Download, Loader2 } from "lucide-react"
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

type ClassOpt = { id: string; name: string; sections: { id: string; name: string }[] }
type TermOpt = { id: string; type: string; sessionName: string; isCurrent: boolean; sessionIsCurrent: boolean }

type AnalyticsResponse = {
  subjects: Array<{
    id: string
    name: string
    code: string
    count: number
    average: number | null
    highest: number | null
    lowest: number | null
    passRate: number | null
    distribution: Record<string, number>
  }>
  termOverTerm: Array<{
    termId: string
    label: string
    scores: Record<string, number>
  }>
  ranking: Array<{
    studentId: string
    name: string
    admissionNumber: string
    className: string | null
    sectionName: string | null
    total: number
    count: number
    average: number | null
    position: number | null
  }>
  gradeBuckets: string[]
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

export function GradeAnalytics({
  classes,
  terms,
}: {
  classes: ClassOpt[]
  terms: TermOpt[]
}) {
  const defaultTerm = terms.find((t) => t.isCurrent && t.sessionIsCurrent) ?? terms[0]
  const [scope, setScope] = useState<"class" | "section">("section")
  const [classId, setClassId] = useState(classes[0]?.id ?? "")
  const [sectionId, setSectionId] = useState(classes[0]?.sections[0]?.id ?? "")
  const [termId, setTermId] = useState(defaultTerm?.id ?? "")

  const arms = classes.find((c) => c.id === classId)?.sections ?? []

  const queryParams = useMemo(() => {
    const p = new URLSearchParams()
    p.set("termId", termId)
    if (scope === "section" && sectionId) p.set("sectionId", sectionId)
    else if (classId) p.set("classId", classId)
    return p.toString()
  }, [scope, classId, sectionId, termId])

  const { data, isLoading } = useQuery<AnalyticsResponse>({
    queryKey: ["grade-analytics", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/grades/analytics?${queryParams}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: !!termId && (!!sectionId || !!classId),
  })

  function exportRanking() {
    if (!data) return
    const rows: (string | number | null)[][] = [
      ["Position", "Admission no.", "Name", "Class", "Arm", "Average %"],
    ]
    for (const r of data.ranking) {
      rows.push([
        r.position ?? "",
        r.admissionNumber,
        r.name,
        r.className ?? "",
        r.sectionName ?? "",
        r.average ?? "",
      ])
    }
    downloadCsv(`class-ranking-${termId}.csv`, rows)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Class performance</h1>
        <p className="text-sm text-muted-foreground">
          Subject averages, grade distribution, term-over-term trends, and full ranking.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <Field label="Scope">
            <Select value={scope} onValueChange={(v) => setScope(v as "class" | "section")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="section">By arm</SelectItem>
                <SelectItem value="class">By class (all arms)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Class">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Arm">
            <Select
              value={sectionId}
              onValueChange={setSectionId}
              disabled={scope === "class" || arms.length === 0}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {arms.map((a) => (
                  <SelectItem key={a.id} value={a.id}>Arm {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Term">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.sessionName} · {t.type[0] + t.type.slice(1).toLowerCase()}
                    {t.isCurrent ? " · current" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {isLoading || !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {data.subjects.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-sm text-muted-foreground">
                No grades recorded yet for this selection.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.subjects.map((s) => (
                  <Card key={s.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{s.name}</CardTitle>
                      <CardDescription>
                        {s.code} · {s.count} student{s.count === 1 ? "" : "s"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <Stat label="Avg" value={s.average === null ? "—" : `${s.average}`} />
                        <Stat label="High" value={s.highest === null ? "—" : `${s.highest}`} />
                        <Stat label="Low" value={s.lowest === null ? "—" : `${s.lowest}`} />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">Pass rate</p>
                        <p
                          className={cn(
                            "text-lg font-bold tabular-nums",
                            (s.passRate ?? 0) >= 80
                              ? "text-emerald-600"
                              : (s.passRate ?? 0) >= 50
                                ? "text-amber-600"
                                : "text-red-600",
                          )}
                        >
                          {s.passRate === null ? "—" : `${s.passRate}%`}
                        </p>
                      </div>
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart
                          data={data.gradeBuckets.map((g) => ({
                            grade: g,
                            count: s.distribution[g] ?? 0,
                          }))}
                          margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="grade" tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="count" fill="#0D2B5E" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {data.termOverTerm.length > 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Term-over-term</CardTitle>
                    <CardDescription>
                      Average score per subject across the last {data.termOverTerm.length} terms.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.termOverTerm.map((p) => ({ name: p.label, ...p.scores }))}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {data.subjects.map((s, idx) => (
                          <Line
                            key={s.id}
                            type="monotone"
                            dataKey={s.name}
                            stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                            strokeWidth={2}
                            dot
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Student ranking</CardTitle>
                <CardDescription>
                  By average across all subjects this term. Export for prize-giving.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={exportRanking} disabled={!data.ranking.length}>
                <Download className="mr-1.5 h-4 w-4" /> CSV
              </Button>
            </CardHeader>
            <CardContent>
              {data.ranking.length === 0 ? (
                <p className="text-sm text-muted-foreground">No students enrolled.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Pos.</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Adm. no.</TableHead>
                      <TableHead>Class · Arm</TableHead>
                      <TableHead className="text-right">Subjects</TableHead>
                      <TableHead className="text-right">Average</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.ranking.map((r) => (
                      <TableRow key={r.studentId}>
                        <TableCell className="font-mono text-xs">{r.position ?? "—"}</TableCell>
                        <TableCell className="text-sm font-medium">{r.name}</TableCell>
                        <TableCell className="font-mono text-xs">{r.admissionNumber}</TableCell>
                        <TableCell className="text-xs">
                          {r.className ? `${r.className} · Arm ${r.sectionName}` : "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs">{r.count}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold">
                          {r.average === null ? "—" : `${r.average}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

const LINE_COLORS = [
  "#0D2B5E",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#6366f1",
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/30 p-2 text-center">
      <p className="text-[9px] uppercase text-muted-foreground">{label}</p>
      <p className="text-sm font-bold tabular-nums">{value}</p>
    </div>
  )
}
