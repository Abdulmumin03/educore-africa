"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  CalendarRange,
  Download,
  Loader2,
  Pencil,
  Eye,
} from "lucide-react"
import { toast } from "sonner"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TimetableGrid, type Slot } from "@/components/dashboard/timetable/timetable-grid"
import { EditSlotDialog } from "@/components/dashboard/timetable/edit-slot-dialog"

type ClassOpt = {
  id: string
  name: string
  sections: { id: string; name: string }[]
}
type TeacherOpt = { id: string; name: string }
type SubjectOpt = { id: string; name: string; code: string }

type View = "me" | "class" | "teacher"

type TimetableResponse = {
  academicYearId: string | null
  days: number[]
  periods: { startTime: string; endTime: string }[]
  conflicts: string[]
  slots: Slot[]
}

export function TimetableClient({
  currentUserRole,
  isAdmin,
  defaultView,
  academicYear,
  classes,
  teachers,
  subjects,
}: {
  currentUserRole: string
  isAdmin: boolean
  defaultView: View
  academicYear: { id: string; name: string } | null
  classes: ClassOpt[]
  teachers: TeacherOpt[]
  subjects: SubjectOpt[]
}) {
  const qc = useQueryClient()
  const [view, setView] = useState<View>(defaultView)
  const [classId, setClassId] = useState<string>("")
  const [sectionId, setSectionId] = useState<string>("")
  const [teacherId, setTeacherId] = useState<string>("")
  const [editMode, setEditMode] = useState(false)
  const [editing, setEditing] = useState<EditTarget | null>(null)

  const sectionsForClass = useMemo(
    () => classes.find((c) => c.id === classId)?.sections ?? [],
    [classes, classId],
  )

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (view === "class") {
      if (sectionId) p.set("sectionId", sectionId)
      else if (classId) p.set("classId", classId)
    } else if (view === "teacher") {
      if (teacherId) p.set("teacherId", teacherId)
    } else {
      p.set("view", "me")
    }
    return p.toString()
  }, [view, classId, sectionId, teacherId])

  const ready =
    view === "me" ||
    (view === "class" && (!!classId || !!sectionId)) ||
    (view === "teacher" && !!teacherId)

  const tt = useQuery<TimetableResponse>({
    queryKey: ["timetable", query],
    queryFn: async () => {
      const res = await fetch(`/api/timetable?${query}`)
      if (!res.ok) throw new Error("Failed to load timetable")
      return res.json()
    },
    enabled: ready,
  })

  const swap = useMutation({
    mutationFn: async ({ idA, idB }: { idA: string; idB: string }) => {
      const res = await fetch("/api/timetable/swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idA, idB }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(b.error ?? "Swap failed")
    },
    onSuccess: () => {
      toast.success("Slots swapped")
      qc.invalidateQueries({ queryKey: ["timetable"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Swap failed"),
  })

  // Admins can only edit when scoped to one section.
  const canEdit = isAdmin && view === "class" && !!sectionId

  const conflictSet = useMemo(
    () => new Set(tt.data?.conflicts ?? []),
    [tt.data?.conflicts],
  )

  function handleCellClick(slot: Slot | null, period: { startTime: string; endTime: string }, day: number) {
    if (!canEdit || !editMode) return
    if (slot) {
      setEditing({
        mode: "edit",
        id: slot.id,
        subjectId: slot.subject.id,
        teacherId: slot.teacher.id,
        room: slot.room ?? "",
        day,
        startTime: period.startTime,
        endTime: period.endTime,
      })
    } else {
      setEditing({
        mode: "create",
        subjectId: "",
        teacherId: "",
        room: "",
        day,
        startTime: period.startTime,
        endTime: period.endTime,
      })
    }
  }

  const pdfHref = useMemo(() => {
    if (!ready) return null
    const p = new URLSearchParams()
    if (sectionId) p.set("sectionId", sectionId)
    else if (classId) p.set("classId", classId)
    else if (teacherId) p.set("teacherId", teacherId)
    return `/api/timetable/pdf?${p.toString()}`
  }, [ready, sectionId, classId, teacherId])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Timetable</h1>
          <p className="text-sm text-muted-foreground">
            {academicYear ? academicYear.name : "No active academic year"} · {viewBlurb(currentUserRole)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? <Eye className="mr-1.5 h-4 w-4" /> : <Pencil className="mr-1.5 h-4 w-4" />}
              {editMode ? "View mode" : "Edit mode"}
            </Button>
          )}
          {pdfHref && (
            <Button asChild variant="outline" size="sm">
              <a href={pdfHref} target="_blank" rel="noopener">
                <Download className="mr-1.5 h-4 w-4" />
                PDF
              </a>
            </Button>
          )}
        </div>
      </div>

      <Tabs
        value={view}
        onValueChange={(v) => {
          setView(v as View)
          setEditMode(false)
        }}
      >
        <TabsList>
          <TabsTrigger value="me">My timetable</TabsTrigger>
          {(isAdmin || currentUserRole === "TEACHER") && (
            <TabsTrigger value="class">By class</TabsTrigger>
          )}
          {isAdmin && <TabsTrigger value="teacher">By teacher</TabsTrigger>}
        </TabsList>
      </Tabs>

      {view === "class" && (
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Class</Label>
              <Select
                value={classId}
                onValueChange={(v) => {
                  setClassId(v)
                  setSectionId("")
                  setEditMode(false)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Arm {isAdmin && "(required to edit)"}</Label>
              <Select
                value={sectionId}
                onValueChange={(v) => {
                  setSectionId(v)
                  setEditMode(false)
                }}
                disabled={!classId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={classId ? "All arms" : "Pick a class first"} />
                </SelectTrigger>
                <SelectContent>
                  {sectionsForClass.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      Arm {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {view === "teacher" && (
        <Card>
          <CardContent className="grid gap-3 p-4 sm:max-w-md">
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
          </CardContent>
        </Card>
      )}

      {editMode && (
        <div className="flex items-center gap-2 rounded-md border bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          Edit mode: click any cell to add/replace a slot. Drag-and-drop between cells to swap.
          {conflictSet.size > 0 && (
            <span className="ml-auto rounded bg-red-100 px-2 py-0.5 font-semibold text-red-800">
              {conflictSet.size} conflict{conflictSet.size === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}

      {!ready ? (
        <EmptyState message="Pick a class or teacher above to see the schedule." />
      ) : tt.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading timetable…
          </CardContent>
        </Card>
      ) : tt.isError ? (
        <EmptyState message="Couldn't load timetable. Try again." />
      ) : !tt.data || tt.data.slots.length === 0 ? (
        <EmptyState
          message={
            canEdit && editMode
              ? "No slots yet — click any cell to add one."
              : "No timetable slots yet for this selection."
          }
        >
          {canEdit && editMode && (
            <FillEmptyGrid
              days={tt.data?.days ?? [1, 2, 3, 4, 5]}
              onCellClick={(d, p) => handleCellClick(null, p, d)}
            />
          )}
        </EmptyState>
      ) : (
        <TimetableGrid
          days={tt.data.days}
          periods={tt.data.periods}
          slots={tt.data.slots}
          conflictSlotIds={conflictSet}
          showSectionLabel={view !== "class" || !sectionId}
          editable={editMode && canEdit}
          onCellClick={handleCellClick}
          onSwap={(idA, idB) => swap.mutate({ idA, idB })}
        />
      )}

      {editing && canEdit && (
        <EditSlotDialog
          academicYearId={academicYear?.id ?? ""}
          classId={classId}
          sectionId={sectionId}
          subjects={subjects}
          teachers={teachers}
          target={editing}
          open={!!editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            qc.invalidateQueries({ queryKey: ["timetable"] })
          }}
        />
      )}
    </div>
  )
}

export type EditTarget =
  | {
      mode: "create"
      subjectId: string
      teacherId: string
      room: string
      day: number
      startTime: string
      endTime: string
    }
  | {
      mode: "edit"
      id: string
      subjectId: string
      teacherId: string
      room: string
      day: number
      startTime: string
      endTime: string
    }

function FillEmptyGrid({
  days,
  onCellClick,
}: {
  days: number[]
  onCellClick: (day: number, period: { startTime: string; endTime: string }) => void
}) {
  // Default scaffolding: 6 periods of 40 mins starting 08:00.
  const periods = Array.from({ length: 6 }, (_, i) => {
    const start = 8 * 60 + i * 40
    const end = start + 40
    return {
      startTime: `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`,
      endTime: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
    }
  })
  return (
    <TimetableGrid
      days={days}
      periods={periods}
      slots={[]}
      conflictSlotIds={new Set()}
      editable={true}
      onCellClick={(slot, period, day) => onCellClick(day, period)}
    />
  )
}

function EmptyState({
  message,
  children,
}: {
  message: string
  children?: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
        <CalendarRange className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{message}</p>
        {children}
      </CardContent>
    </Card>
  )
}

function viewBlurb(role: string) {
  switch (role) {
    case "TEACHER":
      return "your classes for the week."
    case "STUDENT":
      return "your weekly schedule."
    case "PARENT":
      return "your child's schedule."
    default:
      return "school-wide schedule."
  }
}
