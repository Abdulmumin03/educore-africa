"use client"

import { useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { AlertTriangle, Calendar, Loader2, Save, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type ClassOpt = { id: string; name: string; sections: { id: string; name: string }[] }
type SubjectOpt = { id: string; name: string; code: string }
type TeacherOpt = { id: string; name: string }
type YearOpt = { id: string; name: string; isCurrent: boolean }

type ClassPlan = {
  classId: string
  sectionId: string
  label: string
  subjects: { subjectId: string; periodsPerWeek: number; preferredTeacherId?: string }[]
}

type Slot = {
  classId: string
  sectionId: string
  day: number
  period: number
  startTime: string
  endTime: string
  subjectId: string
  teacherId: string
  room: string | null
}

type Conflict =
  | { type: "teacher-double-booked"; teacherId: string; day: number; period: number; slots: Slot[] }
  | { type: "teacher-unavailable"; teacherId: string; day: number; period: number; slot: Slot }
  | { type: "subject-shortfall"; classId: string; subjectId: string; required: number; got: number }

type GenerateResponse = {
  slots: Slot[]
  conflicts: Conflict[]
  warnings: string[]
  model: string
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function TimetableClient({
  classes,
  subjects,
  teachers,
  years,
}: {
  classes: ClassOpt[]
  subjects: SubjectOpt[]
  teachers: TeacherOpt[]
  years: YearOpt[]
}) {
  const [yearId, setYearId] = useState(years.find((y) => y.isCurrent)?.id ?? years[0]?.id ?? "")
  const [periodsPerDay, setPeriodsPerDay] = useState(8)
  const [periodDuration, setPeriodDuration] = useState(40)
  const [startTime, setStartTime] = useState("08:00")
  const [endTime, setEndTime] = useState("15:00")
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]) // Mon–Fri
  const [breakAfter, setBreakAfter] = useState(4)
  const [breakDuration, setBreakDuration] = useState(20)
  const [plans, setPlans] = useState<ClassPlan[]>([])
  const [result, setResult] = useState<GenerateResponse | null>(null)

  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])
  const teacherById = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers])

  function addPlan(classId: string, sectionId: string) {
    if (plans.find((p) => p.sectionId === sectionId)) return
    const klass = classes.find((c) => c.id === classId)
    const arm = klass?.sections.find((s) => s.id === sectionId)
    if (!klass || !arm) return
    setPlans((prev) => [
      ...prev,
      {
        classId,
        sectionId,
        label: `${klass.name} · Arm ${arm.name}`,
        subjects: [],
      },
    ])
  }

  function updatePlanSubjects(sectionId: string, subjects: ClassPlan["subjects"]) {
    setPlans((prev) => prev.map((p) => (p.sectionId === sectionId ? { ...p, subjects } : p)))
  }

  function removePlan(sectionId: string) {
    setPlans((prev) => prev.filter((p) => p.sectionId !== sectionId))
  }

  const generate = useMutation({
    mutationFn: async () => {
      if (plans.length === 0) throw new Error("Add at least one class plan first")
      if (plans.some((p) => p.subjects.length === 0))
        throw new Error("Every plan needs at least one subject")
      const res = await fetch("/api/ai/timetable/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schoolHours: { start: startTime, end: endTime },
          periodsPerDay,
          periodDurationMins: periodDuration,
          breaks: [{ afterPeriod: breakAfter, durationMins: breakDuration, label: "Long break" }],
          daysPerWeek: days,
          classes: plans,
          teachers: teachers.map((t) => ({ teacherId: t.id, name: t.name })),
          rooms: [],
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<GenerateResponse>
    },
    onSuccess: (d) => {
      setResult(d)
      toast.success(
        `Generated ${d.slots.length} slots${d.conflicts.length > 0 ? ` (${d.conflicts.length} conflict${d.conflicts.length === 1 ? "" : "s"})` : ""}`,
      )
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const save = useMutation({
    mutationFn: async () => {
      if (!result || result.slots.length === 0) throw new Error("Nothing to save")
      const res = await fetch("/api/ai/timetable/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ academicYearId: yearId, slots: result.slots, replace: true }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ saved: number }>
    },
    onSuccess: (d) => {
      toast.success(`Saved ${d.saved} timetable slot${d.saved === 1 ? "" : "s"}`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  // Build a conflict lookup so the grid can highlight individual cells.
  const conflictKeys = useMemo(() => {
    const set = new Set<string>()
    if (!result) return set
    for (const c of result.conflicts) {
      if (c.type === "teacher-double-booked") {
        for (const s of c.slots) {
          set.add(`${s.sectionId}-${s.day}-${s.period}`)
        }
      } else if (c.type === "teacher-unavailable") {
        set.add(`${c.slot.sectionId}-${c.day}-${c.period}`)
      }
    }
    return set
  }, [result])

  return (
    <div className="space-y-4 print:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <Calendar className="mr-1.5 inline h-5 w-5 text-violet-600" />
            AI timetable generator
          </h1>
          <p className="text-sm text-muted-foreground">
            Feed constraints, get a draft schedule. Conflicts auto-flag in red so you can iterate.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!result?.slots.length}>
            Print
          </Button>
          <Button size="sm" variant="outline" onClick={() => save.mutate()} disabled={!result?.slots.length || save.isPending}>
            {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save to school
          </Button>
          <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            Generate
          </Button>
        </div>
      </div>

      <Card className="print:hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Constraints</CardTitle>
          <CardDescription>School-wide settings shared by every class plan.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Academic year">
            <Select value={yearId} onValueChange={setYearId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.name}{y.isCurrent ? " · current" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Periods / day">
            <Input type="number" min={1} max={12} value={periodsPerDay} onChange={(e) => setPeriodsPerDay(Number(e.target.value) || 1)} />
          </Field>
          <Field label="Period (mins)">
            <Input type="number" min={20} max={120} value={periodDuration} onChange={(e) => setPeriodDuration(Number(e.target.value) || 40)} />
          </Field>
          <Field label="Start time">
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="End time">
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
          <Field label="Break after period">
            <Input type="number" min={1} max={12} value={breakAfter} onChange={(e) => setBreakAfter(Number(e.target.value) || 4)} />
          </Field>
        </CardContent>
        <CardContent className="border-t">
          <Field label="School days">
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((label, idx) => {
                const on = days.includes(idx)
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      setDays((prev) =>
                        prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort(),
                      )
                    }
                    className={cn(
                      "rounded border px-2 py-1 text-xs transition",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base">Class plans</CardTitle>
            <CardDescription>For each class arm, set the subjects + periods/week.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select onValueChange={(v) => { const [c, s] = v.split("|"); addPlan(c, s) }}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Add a class arm…" /></SelectTrigger>
              <SelectContent>
                {classes.flatMap((c) =>
                  c.sections.map((s) => (
                    <SelectItem key={s.id} value={`${c.id}|${s.id}`}>
                      {c.name} · Arm {s.name}
                    </SelectItem>
                  )),
                )}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {plans.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Add at least one class arm to plan.</p>
          ) : (
            plans.map((p) => (
              <div key={p.sectionId} className="rounded-md border bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">{p.label}</p>
                  <Button size="sm" variant="ghost" onClick={() => removePlan(p.sectionId)}>
                    Remove
                  </Button>
                </div>
                <SubjectsEditor
                  subjects={subjects}
                  teachers={teachers}
                  rows={p.subjects}
                  onChange={(rows) => updatePlanSubjects(p.sectionId, rows)}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          {(result.conflicts.length > 0 || result.warnings.length > 0) && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader>
                <CardTitle className="text-base">
                  <AlertTriangle className="mr-1.5 inline h-4 w-4 text-amber-600" />
                  {result.conflicts.length} conflict{result.conflicts.length === 1 ? "" : "s"}
                  {result.warnings.length > 0 && ` · ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {result.conflicts.map((c, i) => {
                    if (c.type === "teacher-double-booked") {
                      const t = teacherById.get(c.teacherId)
                      return (
                        <li key={i}>
                          <Badge variant="destructive" className="mr-1.5 text-[10px]">Double-booked</Badge>
                          {t?.name ?? c.teacherId} on {DAYS[c.day]} period {c.period} ({c.slots.length} classes)
                        </li>
                      )
                    }
                    if (c.type === "teacher-unavailable") {
                      const t = teacherById.get(c.teacherId)
                      return (
                        <li key={i}>
                          <Badge variant="destructive" className="mr-1.5 text-[10px]">Unavailable</Badge>
                          {t?.name ?? c.teacherId} scheduled during unavailable slot ({DAYS[c.day]} P{c.period})
                        </li>
                      )
                    }
                    const subj = subjectById.get(c.subjectId)
                    return (
                      <li key={i}>
                        <Badge variant="secondary" className="mr-1.5 text-[10px]">Shortfall</Badge>
                        {subj?.name ?? c.subjectId} got {c.got}/{c.required} periods/week
                      </li>
                    )
                  })}
                  {result.warnings.map((w, i) => (
                    <li key={`w-${i}`}>
                      <Badge variant="outline" className="mr-1.5 text-[10px]">Note</Badge>
                      {w}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {plans.map((p) => (
            <Card key={p.sectionId}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{p.label}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Grid
                  slots={result.slots.filter((s) => s.sectionId === p.sectionId)}
                  days={days}
                  periods={periodsPerDay}
                  subjectById={subjectById}
                  teacherById={teacherById}
                  conflictKeys={conflictKeys}
                  sectionId={p.sectionId}
                />
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  )
}

function Grid({
  slots,
  days,
  periods,
  subjectById,
  teacherById,
  conflictKeys,
  sectionId,
}: {
  slots: Slot[]
  days: number[]
  periods: number
  subjectById: Map<string, SubjectOpt>
  teacherById: Map<string, TeacherOpt>
  conflictKeys: Set<string>
  sectionId: string
}) {
  const byKey = new Map(slots.map((s) => [`${s.day}-${s.period}`, s]))
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] uppercase text-muted-foreground">
          <th className="px-1 py-2 text-left">Period</th>
          {days.map((d) => (
            <th key={d} className="px-1 py-2 text-left">{DAYS[d]}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: periods }, (_, i) => i + 1).map((period) => (
          <tr key={period} className="border-t">
            <td className="px-1 py-2 font-mono text-[10px] text-muted-foreground">{period}</td>
            {days.map((d) => {
              const slot = byKey.get(`${d}-${period}`)
              const conflict = conflictKeys.has(`${sectionId}-${d}-${period}`)
              if (!slot) {
                return (
                  <td key={d} className="border-l px-1 py-2 text-muted-foreground">—</td>
                )
              }
              const subj = subjectById.get(slot.subjectId)
              const teacher = teacherById.get(slot.teacherId)
              return (
                <td
                  key={d}
                  className={cn(
                    "border-l px-1 py-2 align-top",
                    conflict ? "bg-red-500/10 text-red-700" : "bg-emerald-500/5",
                  )}
                >
                  <p className="text-xs font-semibold">{subj?.name ?? slot.subjectId}</p>
                  <p className="text-[10px] text-muted-foreground">{teacher?.name ?? slot.teacherId}</p>
                  <p className="text-[9px] font-mono text-muted-foreground">
                    {slot.startTime}–{slot.endTime}
                  </p>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SubjectsEditor({
  subjects,
  teachers,
  rows,
  onChange,
}: {
  subjects: SubjectOpt[]
  teachers: TeacherOpt[]
  rows: ClassPlan["subjects"]
  onChange: (r: ClassPlan["subjects"]) => void
}) {
  function addRow() {
    if (subjects.length === 0) return
    onChange([...rows, { subjectId: subjects[0].id, periodsPerWeek: 3 }])
  }
  function update(i: number, patch: Partial<ClassPlan["subjects"][number]>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function remove(i: number) {
    onChange(rows.filter((_, idx) => idx !== i))
  }
  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">No subjects yet.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-muted-foreground">
              <th className="text-left">Subject</th>
              <th className="text-right">Periods/week</th>
              <th className="text-left">Preferred teacher</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="py-1.5">
                  <Select value={r.subjectId} onValueChange={(v) => update(i, { subjectId: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-1.5 text-right">
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={r.periodsPerWeek}
                    onChange={(e) => update(i, { periodsPerWeek: Number(e.target.value) || 1 })}
                    className="ml-auto h-8 w-16 text-right text-xs"
                  />
                </td>
                <td className="py-1.5">
                  <Select
                    value={r.preferredTeacherId ?? "__any__"}
                    onValueChange={(v) => update(i, { preferredTeacherId: v === "__any__" ? undefined : v })}
                  >
                    <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Any</SelectItem>
                      {teachers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-1.5 text-right">
                  <Button size="sm" variant="ghost" onClick={() => remove(i)}>Remove</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Button size="sm" variant="outline" onClick={addRow}>+ Add subject</Button>
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
