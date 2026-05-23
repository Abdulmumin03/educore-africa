"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { GradingSettings, NotificationSettings } from "@/lib/school-settings"

export function GradingTab({
  initial,
  notifications,
}: {
  initial: GradingSettings
  notifications: NotificationSettings
}) {
  const router = useRouter()
  const [state, setState] = useState<GradingSettings>(initial)
  const [saving, setSaving] = useState(false)

  function setScaleRow(i: number, patch: Partial<GradingSettings["scale"][0]>) {
    setState((s) => ({
      ...s,
      scale: s.scale.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }))
  }

  function addRow() {
    setState((s) => ({
      ...s,
      scale: [...s.scale, { grade: "", minScore: 0, maxScore: 0, points: 0, remark: "" }],
    }))
  }

  function removeRow(i: number) {
    setState((s) => ({ ...s, scale: s.scale.filter((_, idx) => idx !== i) }))
  }

  function toggleComponent(component: string) {
    setState((s) => ({
      ...s,
      caComponents: s.caComponents.includes(component)
        ? s.caComponents.filter((c) => c !== component)
        : [...s.caComponents, component],
    }))
  }

  async function save() {
    if (state.caWeight + state.examWeight !== 100) {
      toast.error("CA + Exam weight must equal 100")
      return
    }
    setSaving(true)
    const res = await fetch("/api/school/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grading: state, notifications }),
    })
    setSaving(false)
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "Couldn't save")
      return
    }
    toast.success("Grading system saved")
    router.refresh()
  }

  const allComponents = ["CA1", "CA2", "Mid-Term", "Assignment", "Project", "Practical"]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grading system</CardTitle>
        <CardDescription>
          Define the scale, CA / exam split, and whether positions are computed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="caWeight">CA weight (%)</Label>
            <Input
              id="caWeight"
              type="number"
              min={0}
              max={100}
              value={state.caWeight}
              onChange={(e) => setState((s) => ({ ...s, caWeight: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="examWeight">Exam weight (%)</Label>
            <Input
              id="examWeight"
              type="number"
              min={0}
              max={100}
              value={state.examWeight}
              onChange={(e) => setState((s) => ({ ...s, examWeight: Number(e.target.value) }))}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.positionRanking}
                onChange={(e) => setState((s) => ({ ...s, positionRanking: e.target.checked }))}
              />
              Enable class position ranking
            </label>
          </div>
        </div>

        <div>
          <Label className="mb-2 block">CA components</Label>
          <div className="flex flex-wrap gap-2">
            {allComponents.map((c) => {
              const active = state.caComponents.includes(c)
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleComponent(c)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-muted text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {c}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Active: {state.caComponents.join(", ") || "none"}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Grade scale</Label>
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              <Plus className="mr-1 h-4 w-4" />
              Add grade
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
              {state.scale.map((row, i) => (
                <div key={i} className="grid grid-cols-[60px_80px_80px_80px_1fr_36px] items-center gap-2 px-3 py-2">
                  <Input
                    value={row.grade}
                    onChange={(e) => setScaleRow(i, { grade: e.target.value })}
                    className="h-8"
                  />
                  <Input
                    type="number"
                    value={row.minScore}
                    onChange={(e) => setScaleRow(i, { minScore: Number(e.target.value) })}
                    className="h-8"
                  />
                  <Input
                    type="number"
                    value={row.maxScore}
                    onChange={(e) => setScaleRow(i, { maxScore: Number(e.target.value) })}
                    className="h-8"
                  />
                  <Input
                    type="number"
                    step="0.1"
                    value={row.points}
                    onChange={(e) => setScaleRow(i, { points: Number(e.target.value) })}
                    className="h-8"
                  />
                  <Input
                    value={row.remark ?? ""}
                    onChange={(e) => setScaleRow(i, { remark: e.target.value })}
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

        <div className="flex justify-end">
          <Button type="button" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save grading system
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
