"use client"

import { useState } from "react"
import dayjs from "dayjs"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"
import { Loader2, Plus, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type EvalItem = {
  id: string
  status: "DRAFT" | "FINAL"
  termType: string
  sessionName: string
  passRate: number | null
  attendanceRate: number | null
  lessonPlanRate: number | null
  parentScore: number | null
  principalComment: string | null
  aiSummary: string | null
  aiModel: string | null
  finalScore: number | null
  badge: string | null
  evaluatorName: string | null
  finalizedAt: string | null
  createdAt: string
}

type ListResponse = { items: EvalItem[] }

type TermOption = { id: string; type: string; sessionName: string }

export function PerformanceTab({
  staffId,
  staffName,
  role,
  department,
  subjects,
  canEvaluate,
}: {
  staffId: string
  staffName: string
  role: string
  department: string | null
  subjects: string[]
  canEvaluate: boolean
}) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ["staff-evaluations", staffId],
    queryFn: async () => {
      const res = await fetch(`/api/staff/${staffId}/evaluations`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }

  const latest = data.items[0]
  const trend = data.items
    .filter((e) => e.finalScore != null)
    .slice(0, 6)
    .reverse()
    .map((e) => ({
      label: `${e.sessionName} ${e.termType[0]}`,
      score: e.finalScore as number,
    }))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Latest appraisal</CardTitle>
            <p className="text-xs text-muted-foreground">
              {latest
                ? `${latest.sessionName} · ${latest.termType[0] + latest.termType.slice(1).toLowerCase()} term`
                : "No appraisals yet"}
            </p>
          </div>
          {canEvaluate && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New evaluation
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!latest ? (
            <p className="text-sm text-muted-foreground">
              No appraisals recorded yet. {canEvaluate ? "Create one to get started." : ""}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant={badgeVariant(latest.badge)}>
                  {(latest.badge ?? "PENDING").replace("_", " ")}
                </Badge>
                <span className="text-3xl font-bold tabular-nums">
                  {latest.finalScore ?? "—"}
                  <span className="text-base font-normal text-muted-foreground">/100</span>
                </span>
              </div>
              <ScoreRow label="Student pass rate" value={latest.passRate} format="pct" />
              <ScoreRow label="Attendance" value={latest.attendanceRate} format="pct" />
              <ScoreRow label="Lesson plan submission" value={latest.lessonPlanRate} format="pct" />
              <ScoreRow label="Parent feedback" value={latest.parentScore} format="rating" />
              {latest.principalComment && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                    Principal comment
                  </p>
                  <p>{latest.principalComment}</p>
                </div>
              )}
              {latest.aiSummary && (
                <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3 text-sm">
                  <p className="text-[10px] font-semibold uppercase text-violet-700">
                    <Sparkles className="mr-1 inline h-3 w-3" />
                    AI summary
                    {latest.aiModel ? ` · ${latest.aiModel}` : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-line">{latest.aiSummary}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {trend.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score history</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#0D2B5E" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {data.items.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All evaluations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {data.items.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2"
                >
                  <span>
                    <span className="font-medium">
                      {e.sessionName} · {e.termType[0] + e.termType.slice(1).toLowerCase()}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {dayjs(e.finalizedAt ?? e.createdAt).format("D MMM YYYY")}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {e.badge && (
                      <Badge variant={badgeVariant(e.badge)} className="text-[10px]">
                        {e.badge.replace("_", " ")}
                      </Badge>
                    )}
                    <span className="font-mono text-xs">{e.finalScore ?? "—"}/100</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {open && (
        <EvaluationDialog
          staffId={staffId}
          staffName={staffName}
          role={role}
          department={department}
          subjects={subjects}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false)
            qc.invalidateQueries({ queryKey: ["staff-evaluations", staffId] })
          }}
        />
      )}
    </div>
  )
}

function ScoreRow({
  label,
  value,
  format,
}: {
  label: string
  value: number | null | undefined
  format: "pct" | "rating"
}) {
  if (value == null) return null
  const display =
    format === "pct" ? `${Math.round(value * 100)}%` : `${value.toFixed(1)} / 5`
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{display}</span>
    </div>
  )
}

function badgeVariant(badge: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (badge) {
    case "OUTSTANDING":
      return "default"
    case "MEETS_EXPECTATIONS":
      return "secondary"
    case "NEEDS_IMPROVEMENT":
      return "outline"
    case "UNSATISFACTORY":
      return "destructive"
    default:
      return "outline"
  }
}

function EvaluationDialog({
  staffId,
  staffName,
  role,
  department,
  subjects,
  onClose,
  onSaved,
}: {
  staffId: string
  staffName: string
  role: string
  department: string | null
  subjects: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const termsQuery = useQuery<{ items: TermOption[] }>({
    queryKey: ["terms-for-eval", staffId],
    queryFn: async () => {
      // Cheaply reuse the school endpoint: fetch via prisma via a thin API.
      // Until that exists, derive from /api/school/terms (or fall back).
      const res = await fetch("/api/school/terms")
      if (!res.ok) return { items: [] as TermOption[] }
      return res.json()
    },
  })

  const [termId, setTermId] = useState<string>("")
  const [passRate, setPassRate] = useState("")
  const [attendanceRate, setAttendanceRate] = useState("")
  const [lessonPlanRate, setLessonPlanRate] = useState("")
  const [parentScore, setParentScore] = useState("")
  const [principalComment, setPrincipalComment] = useState("")
  const [aiSummary, setAiSummary] = useState("")
  const [aiModel, setAiModel] = useState<string>("")
  const [status, setStatus] = useState<"DRAFT" | "FINAL">("DRAFT")

  const parsePct = (s: string) => {
    if (!s) return null
    const n = Number(s)
    if (Number.isNaN(n)) return null
    return Math.max(0, Math.min(1, n / 100))
  }
  const parseRating = (s: string) => {
    if (!s) return null
    const n = Number(s)
    if (Number.isNaN(n)) return null
    return Math.max(1, Math.min(5, n))
  }

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai/generate-appraisal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          staffName,
          role,
          department,
          termLabel: termsQuery.data?.items.find((t) => t.id === termId)?.sessionName ?? "",
          subjects,
          scores: {
            passRate: parsePct(passRate),
            attendanceRate: parsePct(attendanceRate),
            lessonPlanRate: parsePct(lessonPlanRate),
            parentScore: parseRating(parentScore),
          },
          principalComment,
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "AI failed")
      }
      return res.json() as Promise<{ summary: string; model: string }>
    },
    onSuccess: (d) => {
      setAiSummary(d.summary)
      setAiModel(d.model)
      toast.success("AI summary generated")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/staff/${staffId}/evaluations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          termId,
          passRate: parsePct(passRate),
          attendanceRate: parsePct(attendanceRate),
          lessonPlanRate: parsePct(lessonPlanRate),
          parentScore: parseRating(parentScore),
          principalComment,
          aiSummary,
          aiModel: aiModel || undefined,
          status,
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Couldn't save")
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success(status === "FINAL" ? "Evaluation finalized" : "Draft saved")
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Performance evaluation</DialogTitle>
          <DialogDescription>
            Enter scores, optionally generate an AI summary, then save as draft or finalize.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow label="Term">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger><SelectValue placeholder="Pick a term" /></SelectTrigger>
              <SelectContent>
                {(termsQuery.data?.items ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.sessionName} · {t.type[0] + t.type.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Status">
            <Select value={status} onValueChange={(v) => setStatus(v as "DRAFT" | "FINAL")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="FINAL">Finalize</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Student pass rate (%)">
            <Input
              type="number"
              min={0}
              max={100}
              placeholder="0-100"
              value={passRate}
              onChange={(e) => setPassRate(e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Attendance rate (%)">
            <Input
              type="number"
              min={0}
              max={100}
              placeholder="0-100"
              value={attendanceRate}
              onChange={(e) => setAttendanceRate(e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Lesson plan submission (%)">
            <Input
              type="number"
              min={0}
              max={100}
              placeholder="0-100"
              value={lessonPlanRate}
              onChange={(e) => setLessonPlanRate(e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Parent feedback (1-5)">
            <Input
              type="number"
              min={1}
              max={5}
              step={0.1}
              placeholder="1.0-5.0"
              value={parentScore}
              onChange={(e) => setParentScore(e.target.value)}
            />
          </FieldRow>
        </div>

        <FieldRow label="Principal comment">
          <Textarea
            rows={3}
            value={principalComment}
            onChange={(e) => setPrincipalComment(e.target.value)}
            placeholder="Strengths, areas for development, observations…"
          />
        </FieldRow>

        <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              <Sparkles className="mr-1 inline h-4 w-4 text-violet-600" />
              AI-generated summary
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
            >
              {generate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {aiSummary ? "Regenerate" : "Generate"}
            </Button>
          </div>
          <Textarea
            rows={5}
            value={aiSummary}
            onChange={(e) => setAiSummary(e.target.value)}
            placeholder="Will appear here after generation. You can edit before saving."
            className="mt-2 bg-background"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!termId || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {status === "FINAL" ? "Save & finalize" : "Save draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
