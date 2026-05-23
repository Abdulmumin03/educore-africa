"use client"

import { useEffect, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Loader2, Trash2 } from "lucide-react"
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
import type { EditTarget } from "@/components/dashboard/timetable/timetable-client"

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function EditSlotDialog({
  academicYearId,
  classId,
  sectionId,
  subjects,
  teachers,
  target,
  open,
  onClose,
  onSaved,
}: {
  academicYearId: string
  classId: string
  sectionId: string
  subjects: { id: string; name: string; code: string }[]
  teachers: { id: string; name: string }[]
  target: EditTarget
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [subjectId, setSubjectId] = useState(target.subjectId)
  const [teacherId, setTeacherId] = useState(target.teacherId)
  const [room, setRoom] = useState(target.room ?? "")

  useEffect(() => {
    setSubjectId(target.subjectId)
    setTeacherId(target.teacherId)
    setRoom(target.room ?? "")
  }, [target])

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        academicYearId,
        classId,
        sectionId,
        subjectId,
        teacherId,
        dayOfWeek: target.day,
        startTime: target.startTime,
        endTime: target.endTime,
        room: room.trim() || null,
      }
      if (target.mode === "edit") payload.id = target.id
      const res = await fetch("/api/timetable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Save failed")
    },
    onSuccess: () => {
      toast.success(target.mode === "edit" ? "Slot updated" : "Slot added")
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  })

  const del = useMutation({
    mutationFn: async () => {
      if (target.mode !== "edit") return
      const res = await fetch(`/api/timetable/${target.id}`, { method: "DELETE" })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? "Delete failed")
      }
    },
    onSuccess: () => {
      toast.success("Slot removed")
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  })

  const canSave =
    !!subjectId &&
    !!teacherId &&
    !!classId &&
    !!sectionId &&
    !!academicYearId &&
    !save.isPending &&
    !del.isPending

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target.mode === "edit" ? "Edit slot" : "Add slot"}
          </DialogTitle>
          <DialogDescription>
            {DAY_LABELS[target.day]} · {target.startTime}–{target.endTime}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a subject" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Teacher</Label>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a teacher" />
              </SelectTrigger>
              <SelectContent>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Room (optional)</Label>
            <Input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="e.g. Lab 2"
              maxLength={40}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {target.mode === "edit" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (typeof window !== "undefined" && !window.confirm("Remove this slot?")) return
                del.mutate()
              }}
              disabled={save.isPending || del.isPending}
              className="mr-auto text-destructive hover:text-destructive"
            >
              {del.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" />
              )}
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSave}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
