"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Loader2, Star, Pencil } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { GradingSettings } from "@/lib/school-settings"
import { CURRICULUM_PRESETS, EXAM_BODY_CODES } from "@/lib/curriculum-presets"

export type CurriculumDTO = {
  id: string
  code: string
  name: string
  examBodyCode: "WAEC" | "CAMBRIDGE" | "IB" | "NECO" | "NONE"
  isDefault: boolean
  gradingScale: GradingSettings
  aiPromptHint: string | null
  midtermComponents: string[]
}

type FormState = {
  code: string
  name: string
  examBodyCode: CurriculumDTO["examBodyCode"]
  aiPromptHint: string
  gradingScale: GradingSettings
  midtermComponents: string[]
  isDefault: boolean
}

const BLANK_FORM: FormState = {
  code: "",
  name: "",
  examBodyCode: "NONE",
  aiPromptHint: "",
  gradingScale: {
    scale: [{ grade: "", minScore: 0, maxScore: 0, points: 0, remark: "" }],
    caWeight: 40,
    examWeight: 60,
    caComponents: [],
    positionRanking: false,
  },
  midtermComponents: [],
  isDefault: false,
}

export function CurriculaTab({ curricula }: { curricula: CurriculumDTO[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<CurriculumDTO | "new" | null>(null)
  const [form, setForm] = useState<FormState>(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  function openCreate() {
    setForm(BLANK_FORM)
    setEditing("new")
  }

  function openEdit(c: CurriculumDTO) {
    setForm({
      code: c.code,
      name: c.name,
      examBodyCode: c.examBodyCode,
      aiPromptHint: c.aiPromptHint ?? "",
      gradingScale: c.gradingScale,
      midtermComponents: c.midtermComponents,
      isDefault: c.isDefault,
    })
    setEditing(c)
  }

  function loadPreset(code: string) {
    const preset = CURRICULUM_PRESETS.find((p) => p.code === code)
    if (!preset) return
    setForm((f) => ({
      ...f,
      code: f.code || preset.code,
      name: f.name || preset.name,
      examBodyCode: preset.examBodyCode,
      aiPromptHint: f.aiPromptHint || preset.aiPromptHint,
      gradingScale: preset.gradingScale,
      midtermComponents: preset.midtermComponents,
    }))
  }

  function toggleMidtermComponent(component: string) {
    setForm((f) => ({
      ...f,
      midtermComponents: f.midtermComponents.includes(component)
        ? f.midtermComponents.filter((c) => c !== component)
        : [...f.midtermComponents, component],
    }))
  }

  function setScale(patch: Partial<GradingSettings>) {
    setForm((f) => ({ ...f, gradingScale: { ...f.gradingScale, ...patch } }))
  }

  function setRow(i: number, patch: Partial<GradingSettings["scale"][0]>) {
    setForm((f) => ({
      ...f,
      gradingScale: {
        ...f.gradingScale,
        scale: f.gradingScale.scale.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
      },
    }))
  }

  function addRow() {
    setForm((f) => ({
      ...f,
      gradingScale: {
        ...f.gradingScale,
        scale: [
          ...f.gradingScale.scale,
          { grade: "", minScore: 0, maxScore: 0, points: 0, remark: "" },
        ],
      },
    }))
  }

  function removeRow(i: number) {
    setForm((f) => ({
      ...f,
      gradingScale: {
        ...f.gradingScale,
        scale: f.gradingScale.scale.filter((_, idx) => idx !== i),
      },
    }))
  }

  function setComponents(value: string) {
    const list = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    setForm((f) => ({
      ...f,
      gradingScale: { ...f.gradingScale, caComponents: list },
      // Keep midterm picks valid by dropping any that no longer appear.
      midtermComponents: f.midtermComponents.filter((c) => list.includes(c)),
    }))
  }

  async function save() {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and name required")
      return
    }
    if (form.gradingScale.caWeight + form.gradingScale.examWeight !== 100) {
      toast.error("CA + Exam weight must equal 100")
      return
    }
    if (form.gradingScale.scale.length === 0) {
      toast.error("At least one grade row required")
      return
    }
    setSaving(true)
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      examBodyCode: form.examBodyCode,
      aiPromptHint: form.aiPromptHint.trim() || null,
      gradingScale: form.gradingScale,
      midtermComponents: form.midtermComponents,
      isDefault: form.isDefault,
    }
    const res =
      editing === "new"
        ? await fetch("/api/school/curricula", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/school/curricula/${(editing as CurriculumDTO).id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
    setSaving(false)
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "Couldn't save")
      return
    }
    toast.success(editing === "new" ? "Curriculum created" : "Curriculum updated")
    setEditing(null)
    router.refresh()
  }

  async function makeDefault(c: CurriculumDTO) {
    if (c.isDefault) return
    setBusy(`default-${c.id}`)
    const res = await fetch(`/api/school/curricula/${c.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    })
    setBusy(null)
    if (res.ok) {
      toast.success(`${c.name} is now the default`)
      router.refresh()
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      toast.error(data.error ?? "Couldn't update")
    }
  }

  async function remove(c: CurriculumDTO) {
    if (!confirm(`Delete the ${c.name} curriculum?`)) return
    setBusy(`del-${c.id}`)
    const res = await fetch(`/api/school/curricula/${c.id}`, { method: "DELETE" })
    setBusy(null)
    if (res.ok) {
      toast.success("Curriculum deleted")
      router.refresh()
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      toast.error(data.error ?? "Couldn't delete")
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Curricula</CardTitle>
            <CardDescription>
              Define every curriculum your school runs (WAEC, IGCSE, Checkpoint, …). Each
              has its own grading scale and exam-body sheet.
            </CardDescription>
          </div>
          <Button type="button" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            Add curriculum
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {curricula.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
              <p className="text-sm font-medium">No curricula yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add WAEC, IGCSE, or any other curriculum your school uses.
              </p>
            </div>
          ) : null}

          {curricula.map((c) => (
            <div key={c.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{c.name}</span>
                    <Badge variant="outline" className="text-xs">{c.code}</Badge>
                    <Badge variant="secondary" className="text-xs">{c.examBodyCode}</Badge>
                    {c.isDefault && (
                      <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 text-xs">
                        Default
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.gradingScale.scale.length} grade rows · CA {c.gradingScale.caWeight}% /
                    Exam {c.gradingScale.examWeight}%
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {!c.isDefault && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => makeDefault(c)}
                      disabled={busy === `default-${c.id}`}
                      aria-label="Make default"
                      title="Make default"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEdit(c)}
                    aria-label="Edit curriculum"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!c.isDefault && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(c)}
                      disabled={busy === `del-${c.id}`}
                      aria-label="Delete curriculum"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "New curriculum" : `Edit ${form.name || "curriculum"}`}
            </DialogTitle>
            <DialogDescription>
              {editing === "new"
                ? "Pick a preset to start from, or define your own."
                : "Update this curriculum's grading and exam-body settings."}
            </DialogDescription>
          </DialogHeader>

          {editing === "new" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Start from preset</Label>
              <Select onValueChange={loadPreset}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Choose a preset…" />
                </SelectTrigger>
                <SelectContent>
                  {CURRICULUM_PRESETS.map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[140px_1fr_140px]">
            <div className="space-y-1.5">
              <Label htmlFor="cur-code" className="text-xs">Code</Label>
              <Input
                id="cur-code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="WAEC"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cur-name" className="text-xs">Name</Label>
              <Input
                id="cur-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="WAEC (NERDC)"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Exam body</Label>
              <Select
                value={form.examBodyCode}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, examBodyCode: v as FormState["examBodyCode"] }))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXAM_BODY_CODES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cur-hint" className="text-xs">AI prompt hint</Label>
            <Textarea
              id="cur-hint"
              value={form.aiPromptHint}
              onChange={(e) => setForm((f) => ({ ...f, aiPromptHint: e.target.value }))}
              rows={3}
              placeholder="Spliced into the lesson-plan and question-bank AI prompts."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">CA weight (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.gradingScale.caWeight}
                onChange={(e) => setScale({ caWeight: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Exam weight (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.gradingScale.examWeight}
                onChange={(e) => setScale({ examWeight: Number(e.target.value) })}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.gradingScale.positionRanking}
                  onChange={(e) => setScale({ positionRanking: e.target.checked })}
                />
                Position ranking
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">CA components (comma-separated)</Label>
            <Input
              value={form.gradingScale.caComponents.join(", ")}
              onChange={(e) => setComponents(e.target.value)}
              placeholder="CA1, CA2, Mid-Term, Assignment"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Midterm components</Label>
            <p className="text-[11px] text-muted-foreground">
              Which of the components above feed the midterm report.
            </p>
            {form.gradingScale.caComponents.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Add CA components first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {form.gradingScale.caComponents.map((c) => {
                  const on = form.midtermComponents.includes(c)
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleMidtermComponent(c)}
                      className={`rounded-md border px-2.5 py-1 text-xs transition ${
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-muted text-muted-foreground hover:border-foreground/30"
                      }`}
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Grade scale</Label>
              <Button type="button" size="sm" variant="outline" onClick={addRow}>
                <Plus className="mr-1 h-4 w-4" /> Add grade
              </Button>
            </div>
            <div className="rounded-md border">
              <div className="grid grid-cols-[60px_80px_80px_80px_1fr_36px] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                <span>Grade</span>
                <span>Min</span>
                <span>Max</span>
                <span>Points</span>
                <span>Remark</span>
                <span />
              </div>
              <div className="divide-y">
                {form.gradingScale.scale.map((row, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[60px_80px_80px_80px_1fr_36px] items-center gap-2 px-3 py-2"
                  >
                    <Input
                      value={row.grade}
                      onChange={(e) => setRow(i, { grade: e.target.value })}
                      className="h-8"
                    />
                    <Input
                      type="number"
                      value={row.minScore}
                      onChange={(e) => setRow(i, { minScore: Number(e.target.value) })}
                      className="h-8"
                    />
                    <Input
                      type="number"
                      value={row.maxScore}
                      onChange={(e) => setRow(i, { maxScore: Number(e.target.value) })}
                      className="h-8"
                    />
                    <Input
                      type="number"
                      step="0.1"
                      value={row.points}
                      onChange={(e) => setRow(i, { points: Number(e.target.value) })}
                      className="h-8"
                    />
                    <Input
                      value={row.remark ?? ""}
                      onChange={(e) => setRow(i, { remark: e.target.value })}
                      className="h-8"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeRow(i)}
                      aria-label="Remove grade"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {editing === "new" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              />
              Make this the school&apos;s default curriculum
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
