"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, CheckCircle2, Loader2, Save, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { isAnomaly } from "@/lib/grade-config"
import { cn } from "@/lib/utils"

type ClassOpt = { id: string; name: string; sections: { id: string; name: string }[] }
type SubjectOpt = { id: string; name: string; code: string }
type TermOpt = { id: string; type: string; sessionName: string; isCurrent: boolean; sessionIsCurrent: boolean }

type Row = {
  studentId: string
  admissionNumber: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  caComponents: Record<string, number> | null
  caScore: number
  examScore: number
  totalScore: number
  letterGrade: string | null
  position: number | null
  teacherRemark: string | null
  gradeId: string | null
  // local-only:
  dirty?: boolean
}

type MatrixResponse = {
  section: { id: string; name: string; className: string; classId: string } | null
  subject: { id: string; name: string; code: string; waecCode: string | null }
  term: { id: string; type: string; sessionName: string }
  config: {
    components: string[]
    perComponentMax: number
    caMax: number
    examMax: number
    scale: { grade: string; minScore: number; maxScore: number }[]
  }
  rows: Row[]
}

function letterFor(total: number, scale: MatrixResponse["config"]["scale"]) {
  return scale.find((r) => total >= r.minScore && total <= r.maxScore)?.grade ?? null
}

export function GradeEntry({
  classes,
  subjects,
  terms,
}: {
  classes: ClassOpt[]
  subjects: SubjectOpt[]
  terms: TermOpt[]
}) {
  const qc = useQueryClient()
  const defaultTerm = terms.find((t) => t.isCurrent && t.sessionIsCurrent) ?? terms[0]
  const [classId, setClassId] = useState(classes[0]?.id ?? "")
  const [sectionId, setSectionId] = useState(classes[0]?.sections[0]?.id ?? "")
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "")
  const [termId, setTermId] = useState(defaultTerm?.id ?? "")

  const arms = classes.find((c) => c.id === classId)?.sections ?? []
  useEffect(() => {
    const a = classes.find((c) => c.id === classId)?.sections ?? []
    if (a.length > 0 && !a.find((x) => x.id === sectionId)) setSectionId(a[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId])

  const queryParams = useMemo(() => {
    const p = new URLSearchParams()
    p.set("sectionId", sectionId)
    p.set("subjectId", subjectId)
    p.set("termId", termId)
    if (classes.find((c) => c.id === classId)) p.set("classId", classId)
    return p.toString()
  }, [classId, sectionId, subjectId, termId, classes])

  const matrix = useQuery<MatrixResponse>({
    queryKey: ["grade-matrix", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/grades?${queryParams}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: !!sectionId && !!subjectId && !!termId,
  })

  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    if (matrix.data) setRows(matrix.data.rows)
  }, [matrix.data])

  const config = matrix.data?.config

  const totals = useMemo(() => {
    const examScores = rows.map((r) => r.examScore).filter((n) => n > 0)
    return { examScores }
  }, [rows])

  function recompute(row: Row): Row {
    if (!config) return row
    const ca = config.components.reduce((acc, name) => {
      const v = row.caComponents?.[name]
      return acc + (typeof v === "number" && Number.isFinite(v) ? v : 0)
    }, 0)
    const total = Math.round((ca + (row.examScore || 0)) * 10) / 10
    return {
      ...row,
      caScore: Math.round(ca * 10) / 10,
      totalScore: total,
      letterGrade: letterFor(total, config.scale),
    }
  }

  function updateComponent(studentId: string, name: string, value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.studentId === studentId
          ? recompute({
              ...r,
              dirty: true,
              caComponents: {
                ...(r.caComponents ?? {}),
                [name]:
                  value === ""
                    ? 0
                    : Math.max(0, Math.min(100, Number(value) || 0)),
              },
            })
          : r,
      ),
    )
  }

  function updateExam(studentId: string, value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.studentId === studentId
          ? recompute({
              ...r,
              dirty: true,
              examScore:
                value === "" ? 0 : Math.max(0, Math.min(100, Number(value) || 0)),
            })
          : r,
      ),
    )
  }

  const save = useMutation({
    mutationFn: async () => {
      const dirtyEntries = rows
        .filter((r) => r.dirty)
        .map((r) => ({
          studentId: r.studentId,
          caComponents: r.caComponents ?? undefined,
          examScore: r.examScore,
          teacherRemark: r.teacherRemark ?? undefined,
        }))
      if (dirtyEntries.length === 0) return { saved: 0 }
      const res = await fetch("/api/grades", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId,
          sectionId,
          termId,
          subjectId,
          entries: dirtyEntries,
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ saved: number }>
    },
    onSuccess: (d) => {
      if (d.saved > 0) toast.success(`Saved ${d.saved} row(s)`)
      qc.invalidateQueries({ queryKey: ["grade-matrix", queryParams] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  // Per-cell autosave on blur — only the row that changed.
  const blurSave = useMutation({
    mutationFn: async (studentId: string) => {
      const row = rows.find((r) => r.studentId === studentId)
      if (!row || !row.dirty) return
      const res = await fetch("/api/grades", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId,
          sectionId,
          termId,
          subjectId,
          entries: [
            {
              studentId: row.studentId,
              caComponents: row.caComponents ?? undefined,
              examScore: row.examScore,
              teacherRemark: row.teacherRemark ?? undefined,
            },
          ],
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      setRows((prev) =>
        prev.map((r) => (r.studentId === studentId ? { ...r, dirty: false } : r)),
      )
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  })

  // Generate AI teacher remarks for every row with a non-zero total. Caps
  // concurrency at 3 to avoid hammering Anthropic. Marks rows dirty so the
  // Save-all button persists the new remarks; the user can still edit before
  // saving.
  const aiRemarks = useMutation({
    mutationFn: async () => {
      const subjectName = matrix.data?.subject.name ?? "this subject"
      const subjectScores = rows.map((r) => r.totalScore).filter((n) => n > 0)
      const classAverage = subjectScores.length
        ? Math.round((subjectScores.reduce((a, b) => a + b, 0) / subjectScores.length) * 10) / 10
        : undefined
      const targets = rows.filter((r) => r.totalScore > 0)
      if (targets.length === 0) {
        throw new Error("No graded rows yet — enter scores first")
      }
      const limit = 3
      const results: { studentId: string; remark: string | null }[] = []
      for (let i = 0; i < targets.length; i += limit) {
        const slice = targets.slice(i, i + limit)
        // eslint-disable-next-line no-await-in-loop
        const settled = await Promise.allSettled(
          slice.map(async (r) => {
            const res = await fetch("/api/ai/generate-remark", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                studentName: `${r.firstName} ${r.lastName}`,
                subject: subjectName,
                score: r.totalScore,
                classAverage,
                letterGrade: r.letterGrade ?? undefined,
              }),
            })
            if (!res.ok) throw new Error("AI failed")
            const json = (await res.json()) as { remark: string }
            return { studentId: r.studentId, remark: json.remark }
          }),
        )
        for (let j = 0; j < settled.length; j++) {
          const s = settled[j]
          if (s.status === "fulfilled") results.push(s.value)
          else results.push({ studentId: slice[j].studentId, remark: null })
        }
      }
      setRows((prev) =>
        prev.map((r) => {
          const hit = results.find((x) => x.studentId === r.studentId)
          if (!hit || !hit.remark) return r
          return { ...r, teacherRemark: hit.remark, dirty: true }
        }),
      )
      const filled = results.filter((r) => r.remark).length
      return { generated: filled, failed: targets.length - filled }
    },
    onSuccess: (d) => {
      toast.success(
        `Generated ${d.generated} remark${d.generated === 1 ? "" : "s"}${
          d.failed > 0 ? ` (${d.failed} failed)` : ""
        } — click Save all to persist.`,
      )
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const cellRefs = useRef<Map<string, HTMLInputElement | null>>(new Map())
  function focusKey(studentIdx: number, colIdx: number) {
    return `${studentIdx}-${colIdx}`
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, sIdx: number, cIdx: number, colCount: number) {
    if (e.key === "Enter") {
      e.preventDefault()
      const next = cellRefs.current.get(focusKey(sIdx + 1, cIdx))
      next?.focus()
      next?.select()
    } else if (e.key === "Tab") {
      // Browser handles Tab natively, but if Tabbing off the last cell of a row,
      // jump to the next row's first input.
      if (cIdx === colCount - 1 && !e.shiftKey) {
        const next = cellRefs.current.get(focusKey(sIdx + 1, 0))
        if (next) {
          e.preventDefault()
          next.focus()
          next.select()
        }
      }
    }
  }

  const dirtyCount = rows.filter((r) => r.dirty).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Grade entry</h1>
          <p className="text-sm text-muted-foreground">
            Tab / Enter to move between cells. Autosaves on blur.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => aiRemarks.mutate()}
            disabled={aiRemarks.isPending || !rows.some((r) => r.totalScore > 0)}
          >
            {aiRemarks.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4 text-violet-600" />
            )}
            AI remarks
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={dirtyCount === 0 || save.isPending}>
            {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save all {dirtyCount > 0 ? `(${dirtyCount})` : ""}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-4">
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
            <Select value={sectionId} onValueChange={setSectionId} disabled={arms.length === 0}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {arms.map((a) => (
                  <SelectItem key={a.id} value={a.id}>Arm {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Subject">
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} <span className="text-xs text-muted-foreground">({s.code})</span>
                  </SelectItem>
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

      {!config || matrix.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading roster…
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            No students enrolled in this arm.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30 text-[10px] uppercase text-muted-foreground">
                  <th className="px-2 py-2 text-left">Student</th>
                  {config.components.map((name) => (
                    <th key={name} className="px-1 py-2 text-right">
                      {name}
                      <span className="ml-1 text-[9px] opacity-60">/{config.perComponentMax}</span>
                    </th>
                  ))}
                  <th className="px-1 py-2 text-right">CA</th>
                  <th className="px-1 py-2 text-right">
                    Exam
                    <span className="ml-1 text-[9px] opacity-60">/{config.examMax}</span>
                  </th>
                  <th className="px-1 py-2 text-right">Total</th>
                  <th className="px-2 py-2 text-center">Grade</th>
                  <th className="px-2 py-2 text-center">Pos.</th>
                  <th className="px-2 py-2 text-left">Remark</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, sIdx) => {
                  const colCount = config.components.length + 1
                  const examAnomaly =
                    r.examScore > 0 && isAnomaly(r.examScore, totals.examScores, 2)
                  const initials = (r.firstName[0] ?? "") + (r.lastName[0] ?? "")
                  return (
                    <tr key={r.studentId} className="border-b last:border-0">
                      <td className="px-2 py-1.5">
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
                          {r.dirty && (
                            <span title="Unsaved" className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
                          )}
                          {blurSave.isPending && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                          {!r.dirty && r.gradeId && (
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          )}
                        </div>
                      </td>
                      {config.components.map((name, cIdx) => {
                        const v = r.caComponents?.[name]
                        return (
                          <td key={name} className="px-1 py-1.5">
                            <input
                              ref={(el) => {
                                cellRefs.current.set(focusKey(sIdx, cIdx), el)
                              }}
                              type="number"
                              min={0}
                              max={config.perComponentMax}
                              step={0.5}
                              defaultValue={v ?? ""}
                              onChange={(e) => updateComponent(r.studentId, name, e.target.value)}
                              onBlur={() => r.dirty && blurSave.mutate(r.studentId)}
                              onKeyDown={(e) => handleKeyDown(e, sIdx, cIdx, colCount)}
                              className="w-14 rounded border border-input bg-background px-1 py-1 text-right text-xs tabular-nums focus:border-primary focus:outline-none"
                            />
                          </td>
                        )
                      })}
                      <td className="px-1 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                        {r.caScore.toFixed(1)}
                      </td>
                      <td className="px-1 py-1.5">
                        <input
                          ref={(el) => {
                            cellRefs.current.set(focusKey(sIdx, config.components.length), el)
                          }}
                          type="number"
                          min={0}
                          max={config.examMax}
                          step={0.5}
                          defaultValue={r.examScore || ""}
                          title={examAnomaly ? "Score is >2σ from class mean" : undefined}
                          onChange={(e) => updateExam(r.studentId, e.target.value)}
                          onBlur={() => r.dirty && blurSave.mutate(r.studentId)}
                          onKeyDown={(e) => handleKeyDown(e, sIdx, config.components.length, colCount)}
                          className={cn(
                            "w-14 rounded border px-1 py-1 text-right text-xs tabular-nums focus:outline-none",
                            examAnomaly
                              ? "border-amber-500 bg-amber-500/10 text-amber-900 focus:border-amber-600"
                              : "border-input bg-background focus:border-primary",
                          )}
                        />
                        {examAnomaly && (
                          <AlertTriangle className="ml-1 inline h-3 w-3 text-amber-600" />
                        )}
                      </td>
                      <td className="px-1 py-1.5 text-right text-xs font-semibold tabular-nums">
                        {r.totalScore.toFixed(1)}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {r.letterGrade && (
                          <Badge variant="outline" className="text-[10px]">
                            {r.letterGrade}
                          </Badge>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center text-xs text-muted-foreground">
                        {r.position ?? "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          defaultValue={r.teacherRemark ?? ""}
                          placeholder="—"
                          onChange={(e) => {
                            const value = e.target.value
                            setRows((prev) =>
                              prev.map((p) =>
                                p.studentId === r.studentId
                                  ? { ...p, teacherRemark: value, dirty: true }
                                  : p,
                              ),
                            )
                          }}
                          onBlur={() => r.dirty && blurSave.mutate(r.studentId)}
                          className="w-48 rounded border border-input bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                          title={r.teacherRemark ?? ""}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
