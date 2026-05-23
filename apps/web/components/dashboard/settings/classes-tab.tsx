"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, ArrowUp, ArrowDown, Loader2, Pencil, Check, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CurriculumDTO } from "@/components/dashboard/settings/curricula-tab"

export type SectionDTO = { id: string; name: string; capacity: number }
export type ClassDTO = {
  id: string
  name: string
  level: number
  curriculumId: string
  sections: SectionDTO[]
}

export function ClassesTab({
  classes,
  curricula,
}: {
  classes: ClassDTO[]
  curricula: CurriculumDTO[]
}) {
  const router = useRouter()
  const defaultCurriculumId = curricula.find((c) => c.isDefault)?.id ?? curricula[0]?.id ?? ""
  const curriculaById = new Map(curricula.map((c) => [c.id, c]))
  const [busy, setBusy] = useState<string | null>(null)
  const [newClassName, setNewClassName] = useState("")
  const [newClassLevel, setNewClassLevel] = useState<number>(
    (classes[classes.length - 1]?.level ?? 0) + 1,
  )
  const [newClassCurriculum, setNewClassCurriculum] = useState<string>(defaultCurriculumId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editLevel, setEditLevel] = useState<number>(1)
  const [editCurriculum, setEditCurriculum] = useState<string>("")

  function startEdit(c: ClassDTO) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditLevel(c.level)
    setEditCurriculum(c.curriculumId)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(classId: string) {
    const name = editName.trim()
    if (!name) {
      toast.error("Class name required")
      return
    }
    setBusy(`edit-${classId}`)
    const body: Record<string, unknown> = { name, level: editLevel }
    if (editCurriculum) body.curriculumId = editCurriculum
    const res = await fetch(`/api/school/classes/${classId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    setBusy(null)
    if (res.ok) {
      toast.success("Class updated")
      setEditingId(null)
      router.refresh()
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      toast.error(data.error ?? "Couldn't update class")
    }
  }

  async function addClass() {
    if (!newClassName.trim()) {
      toast.error("Class name required")
      return
    }
    setBusy("new-class")
    const body: Record<string, unknown> = {
      name: newClassName.trim(),
      level: newClassLevel,
    }
    if (newClassCurriculum) body.curriculumId = newClassCurriculum
    const res = await fetch("/api/school/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    setBusy(null)
    if (res.ok) {
      toast.success("Class added")
      setNewClassName("")
      setNewClassLevel((l) => l + 1)
      router.refresh()
    } else toast.error("Couldn't add class")
  }

  async function addSection(classId: string) {
    setBusy(`section-${classId}`)
    const klass = classes.find((c) => c.id === classId)!
    const nextLetter = String.fromCharCode(65 + klass.sections.length)
    const res = await fetch("/api/school/sections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ classId, name: nextLetter, capacity: 40 }),
    })
    setBusy(null)
    if (res.ok) {
      toast.success(`Arm ${nextLetter} added`)
      router.refresh()
    } else toast.error("Couldn't add arm")
  }

  async function deleteSection(id: string) {
    setBusy(`del-${id}`)
    const res = await fetch(`/api/school/sections/${id}`, { method: "DELETE" })
    setBusy(null)
    if (res.ok) {
      toast.success("Arm removed")
      router.refresh()
    } else toast.error("Couldn't remove arm")
  }

  async function updateSectionCapacity(id: string, capacity: number) {
    setBusy(`cap-${id}`)
    const res = await fetch(`/api/school/sections/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capacity }),
    })
    setBusy(null)
    if (res.ok) {
      toast.success("Capacity updated")
      router.refresh()
    } else toast.error("Couldn't update")
  }

  async function reorder(classId: string, direction: "up" | "down") {
    setBusy(`reorder-${classId}`)
    const res = await fetch(`/api/school/classes/${classId}/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ direction }),
    })
    setBusy(null)
    if (res.ok) router.refresh()
    else toast.error("Couldn't reorder")
  }

  async function deleteClass(id: string) {
    if (!confirm("Delete this class and all of its arms?")) return
    setBusy(`delclass-${id}`)
    const res = await fetch(`/api/school/classes/${id}`, { method: "DELETE" })
    setBusy(null)
    if (res.ok) {
      toast.success("Class deleted")
      router.refresh()
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      toast.error(data.error ?? "Couldn't delete (has enrollments?)")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Classes &amp; arms</CardTitle>
        <CardDescription>Manage class levels and the arms inside each.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {classes.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
            <p className="text-sm font-medium">No classes yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add the first class below. Arms (A, B, ...) are added per class.
            </p>
          </div>
        ) : null}

        {classes.map((c, i) => (
          <div key={c.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              {editingId === c.id ? (
                <div className="flex flex-1 flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8 w-40"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Level</Label>
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      value={editLevel}
                      onChange={(e) => setEditLevel(Number(e.target.value))}
                      className="h-8 w-20"
                    />
                  </div>
                  {curricula.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Curriculum</Label>
                      <Select value={editCurriculum} onValueChange={setEditCurriculum}>
                        <SelectTrigger className="h-8 w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {curricula.map((cu) => (
                            <SelectItem key={cu.id} value={cu.id}>
                              {cu.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-xs text-muted-foreground">level {c.level}</span>
                    {curriculaById.get(c.curriculumId) && (
                      <Badge variant="outline" className="text-xs">
                        {curriculaById.get(c.curriculumId)!.code}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{c.sections.length} arm(s)</p>
                </div>
              )}
              <div className="flex items-center gap-1">
                {editingId === c.id ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => saveEdit(c.id)}
                      disabled={busy === `edit-${c.id}`}
                      aria-label="Save"
                    >
                      {busy === `edit-${c.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={cancelEdit}
                      disabled={busy === `edit-${c.id}`}
                      aria-label="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={i === 0 || busy === `reorder-${c.id}`}
                      onClick={() => reorder(c.id, "up")}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={i === classes.length - 1 || busy === `reorder-${c.id}`}
                      onClick={() => reorder(c.id, "down")}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => startEdit(c)}
                      aria-label="Edit class"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => deleteClass(c.id)}
                      aria-label="Delete class"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {c.sections.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-sm"
                >
                  <span className="font-medium">Arm {s.name}</span>
                  <Input
                    type="number"
                    defaultValue={s.capacity}
                    min={1}
                    max={200}
                    className="h-7 w-16 text-xs"
                    onBlur={(e) => {
                      const v = Number(e.target.value)
                      if (v && v !== s.capacity) updateSectionCapacity(s.id, v)
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => deleteSection(s.id)}
                    disabled={busy === `del-${s.id}`}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remove arm ${s.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addSection(c.id)}
                disabled={busy === `section-${c.id}`}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add arm
              </Button>
            </div>
          </div>
        ))}

        <div className="grid gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-[1fr_100px_180px_auto]">
          <div className="space-y-1">
            <Label className="text-xs">New class name</Label>
            <Input
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="JSS 1"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Level</Label>
            <Input
              type="number"
              value={newClassLevel}
              onChange={(e) => setNewClassLevel(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Curriculum</Label>
            <Select
              value={newClassCurriculum}
              onValueChange={setNewClassCurriculum}
              disabled={curricula.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                {curricula.map((cu) => (
                  <SelectItem key={cu.id} value={cu.id}>
                    {cu.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={addClass} disabled={busy === "new-class"}>
              {busy === "new-class" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1 h-4 w-4" />
              )}
              Add class
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
