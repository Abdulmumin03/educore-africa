"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Loader2, Plus, Sparkles, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
import { RichEditor } from "@/components/dashboard/announcements/rich-editor"

type ClassOpt = {
  id: string
  name: string
  sections: { id: string; name: string }[]
}
type SubjectOpt = { id: string; name: string; code: string }

type Methodology = "LECTURE" | "DISCUSSION" | "PRACTICAL" | "MIXED"

type FormState = {
  subjectId: string
  classId: string
  sectionId: string
  date: string
  durationMin: number
  topic: string
  subtopic: string
  objectives: string[]
  methodology: Methodology
  materials: string[]
  contentMd: string
  assessment: string
  homework: string
  isShared: boolean
}

const EMPTY: FormState = {
  subjectId: "",
  classId: "",
  sectionId: "",
  date: dayjs().format("YYYY-MM-DD"),
  durationMin: 40,
  topic: "",
  subtopic: "",
  objectives: [""],
  methodology: "LECTURE",
  materials: [],
  contentMd: "",
  assessment: "",
  homework: "",
  isShared: false,
}

export function LessonDialog({
  mode,
  lessonId,
  classes,
  subjects,
  open,
  aiConfigured,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit"
  lessonId?: string
  classes: ClassOpt[]
  subjects: SubjectOpt[]
  open: boolean
  aiConfigured: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [aiUsed, setAiUsed] = useState(false)

  const sectionsForClass =
    classes.find((c) => c.id === form.classId)?.sections ?? []

  // For edit mode, fetch the lesson.
  const detail = useQuery<FormState & { canEdit: boolean }>({
    queryKey: ["lesson", lessonId],
    queryFn: async () => {
      const res = await fetch(`/api/lessons/${lessonId}`)
      if (!res.ok) throw new Error("Failed to load")
      const data = await res.json()
      return {
        subjectId: data.subject.id,
        classId: data.class.id,
        sectionId: data.section?.id ?? "",
        date: data.date,
        durationMin: data.durationMin,
        topic: data.topic,
        subtopic: data.subtopic ?? "",
        objectives: data.objectives.length ? data.objectives : [""],
        methodology: data.methodology,
        materials: data.materials ?? [],
        contentMd: data.contentMd,
        assessment: data.assessment ?? "",
        homework: data.homework ?? "",
        isShared: data.isShared,
        canEdit: data.canEdit,
      }
    },
    enabled: mode === "edit" && !!lessonId && open,
  })

  useEffect(() => {
    if (mode === "create") setForm(EMPTY)
  }, [mode, open])

  useEffect(() => {
    if (mode === "edit" && detail.data) {
      const { canEdit, ...rest } = detail.data
      void canEdit
      setForm(rest)
    }
  }, [mode, detail.data])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }))
  }

  const subjectMeta = subjects.find((s) => s.id === form.subjectId)
  const classMeta = classes.find((c) => c.id === form.classId)

  const aiFill = useMutation({
    mutationFn: async () => {
      if (!subjectMeta || !classMeta || !form.topic.trim()) {
        throw new Error("Pick subject + class, and enter the topic first")
      }
      const res = await fetch("/api/ai/generate-lesson-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: subjectMeta.name,
          classLevel: classMeta.name,
          topic: form.topic.trim(),
          durationMin: form.durationMin,
          classId: form.classId,
        }),
      })
      const b = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        objectives?: string[]
        methodology?: Methodology
        materials?: string[]
        contentMd?: string
        assessment?: string
        homework?: string
      }
      if (!res.ok || !b.ok) throw new Error(b.error ?? "AI generation failed")
      return b
    },
    onSuccess: (b) => {
      setForm((p) => ({
        ...p,
        objectives: b.objectives ?? p.objectives,
        methodology: b.methodology ?? p.methodology,
        materials: b.materials ?? p.materials,
        contentMd: b.contentMd ?? p.contentMd,
        assessment: b.assessment ?? p.assessment,
        homework: b.homework ?? p.homework,
      }))
      setAiUsed(true)
      toast.success("Auto-filled — please review before saving")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        subjectId: form.subjectId,
        classId: form.classId,
        sectionId: form.sectionId || null,
        date: form.date,
        durationMin: form.durationMin,
        topic: form.topic.trim(),
        subtopic: form.subtopic.trim() || null,
        objectives: form.objectives.map((o) => o.trim()).filter(Boolean),
        methodology: form.methodology,
        materials: form.materials.map((m) => m.trim()).filter(Boolean),
        contentMd: form.contentMd,
        assessment: form.assessment.trim() || null,
        homework: form.homework.trim() || null,
        isShared: form.isShared,
      }
      const url = mode === "edit" && lessonId ? `/api/lessons/${lessonId}` : "/api/lessons"
      const method = mode === "edit" ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Save failed")
    },
    onSuccess: () => {
      toast.success(mode === "edit" ? "Saved" : "Created")
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const canSave =
    !!form.subjectId &&
    !!form.classId &&
    form.topic.trim().length >= 2 &&
    form.objectives.some((o) => o.trim().length >= 2) &&
    form.contentMd.trim().length >= 2 &&
    !save.isPending

  const canAi =
    aiConfigured && !!form.subjectId && !!form.classId && form.topic.trim().length >= 2

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit lesson plan" : "New lesson plan"}</DialogTitle>
          <DialogDescription>
            Fill the structured fields then write the lesson body, or use AI Auto-fill once subject + class + topic are set.
          </DialogDescription>
        </DialogHeader>

        {mode === "edit" && detail.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Subject">
                <Select value={form.subjectId} onValueChange={(v) => update("subjectId", v)}>
                  <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Class">
                <Select
                  value={form.classId}
                  onValueChange={(v) => {
                    update("classId", v)
                    update("sectionId", "")
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Arm (optional)">
                <Select
                  value={form.sectionId}
                  onValueChange={(v) => update("sectionId", v)}
                  disabled={!form.classId}
                >
                  <SelectTrigger><SelectValue placeholder={form.classId ? "Any arm" : "Pick class first"} /></SelectTrigger>
                  <SelectContent>
                    {sectionsForClass.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        Arm {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Date">
                <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
              </Field>
              <Field label="Duration (mins)">
                <Input
                  type="number"
                  min={20}
                  max={180}
                  value={form.durationMin}
                  onChange={(e) => update("durationMin", Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Methodology">
                <Select
                  value={form.methodology}
                  onValueChange={(v) => update("methodology", v as Methodology)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LECTURE">Lecture</SelectItem>
                    <SelectItem value="DISCUSSION">Discussion</SelectItem>
                    <SelectItem value="PRACTICAL">Practical</SelectItem>
                    <SelectItem value="MIXED">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Topic">
                <Input
                  value={form.topic}
                  onChange={(e) => update("topic", e.target.value)}
                  placeholder="e.g. Quadratic equations"
                  maxLength={200}
                />
              </Field>
              <Field label="Subtopic (optional)">
                <Input
                  value={form.subtopic}
                  onChange={(e) => update("subtopic", e.target.value)}
                  placeholder="e.g. Completing the square"
                  maxLength={200}
                />
              </Field>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <div>
                <p className="text-sm font-medium">AI Auto-fill</p>
                <p className="text-xs text-muted-foreground">
                  {aiConfigured
                    ? "Generates objectives, methodology, materials, body, assessment, homework. Review before saving."
                    : "AI is not configured for this school."}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => aiFill.mutate()}
                disabled={!canAi || aiFill.isPending}
              >
                {aiFill.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4" />
                )}
                Auto-fill
              </Button>
            </div>

            {aiUsed && (
              <p className="rounded-md border bg-amber-50 px-3 py-2 text-xs text-amber-900">
                AI-generated — please review every section before saving.
              </p>
            )}

            <Field label="Learning objectives">
              <RepeatableList
                value={form.objectives}
                onChange={(v) => update("objectives", v)}
                placeholder="e.g. Define the standard form of a quadratic equation"
                addLabel="Add objective"
              />
            </Field>

            <Field label="Materials needed">
              <RepeatableList
                value={form.materials}
                onChange={(v) => update("materials", v)}
                placeholder="e.g. Graph paper, calculator"
                addLabel="Add material"
              />
            </Field>

            <Field label="Lesson content (steps / body)">
              <RichEditor
                value={form.contentMd}
                onChange={(md) => update("contentMd", md.slice(0, 20000))}
                maxLength={20000}
                placeholder="Walk through introduction → presentation → practice → conclusion."
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Assessment method">
                <Input
                  value={form.assessment}
                  onChange={(e) => update("assessment", e.target.value)}
                  placeholder="e.g. 5-mark exit ticket"
                  maxLength={1000}
                />
              </Field>
              <Field label="Homework (optional)">
                <Input
                  value={form.homework}
                  onChange={(e) => update("homework", e.target.value)}
                  placeholder="Optional follow-up"
                  maxLength={1000}
                />
              </Field>
            </div>

            <label className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={form.isShared}
                onChange={(e) => update("isShared", e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="font-medium">Share with other teachers in this school</span>
                <span className="block text-xs text-muted-foreground">
                  Adds this plan to the Shared Library so colleagues can duplicate it.
                </span>
              </span>
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSave}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {mode === "edit" ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

function RepeatableList({
  value,
  onChange,
  placeholder,
  addLabel,
}: {
  value: string[]
  onChange: (next: string[]) => void
  placeholder: string
  addLabel: string
}) {
  return (
    <div className="space-y-1.5">
      {value.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={v}
            onChange={(e) => {
              const next = [...value]
              next[i] = e.target.value
              onChange(next)
            }}
            placeholder={placeholder}
            maxLength={200}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label="Remove"
            disabled={value.length === 1}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...value, ""])}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {addLabel}
      </Button>
    </div>
  )
}
