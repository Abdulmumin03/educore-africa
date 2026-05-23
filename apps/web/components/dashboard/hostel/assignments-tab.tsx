"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bed, Loader2, LogOut, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
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
import { cn } from "@/lib/utils"

type Hostel = { id: string; name: string; gender: "MALE" | "FEMALE" | "MIXED" }
type Bed = {
  bedNumber: number
  assignment: {
    id: string
    fromDate: string
    student: {
      id: string
      admissionNumber: string
      firstName: string
      lastName: string
      avatarUrl: string | null
      gender: "MALE" | "FEMALE" | "OTHER" | null
    }
  } | null
}
type Room = {
  id: string
  roomNo: string
  capacity: number
  beds: Bed[]
}

type StudentRow = {
  id: string
  admissionNumber: string
  firstName: string
  lastName: string
  gender: "MALE" | "FEMALE" | "OTHER" | null
  avatarUrl: string | null
}

function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

export function HostelAssignmentsTab() {
  const [hostelId, setHostelId] = useState<string>("")
  const [assignTarget, setAssignTarget] = useState<{ roomId: string; bedNumber: number } | null>(
    null,
  )

  const qc = useQueryClient()

  const hostels = useQuery<{ items: Hostel[] }>({
    queryKey: ["hostels"],
    queryFn: async () => {
      const res = await fetch("/api/hostel/hostels")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const rooms = useQuery<{ hostel: Hostel; rooms: Room[] }>({
    queryKey: ["hostel-rooms", hostelId],
    queryFn: async () => {
      const res = await fetch(`/api/hostel/rooms?hostelId=${hostelId}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: !!hostelId,
  })

  const checkOut = useMutation({
    mutationFn: async (assignmentId: string) => {
      const res = await fetch(`/api/hostel/assignments/${assignmentId}`, { method: "DELETE" })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? "Failed")
      }
    },
    onSuccess: () => {
      toast.success("Student checked out")
      qc.invalidateQueries({ queryKey: ["hostel-rooms", hostelId] })
      qc.invalidateQueries({ queryKey: ["hostels"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const list = hostels.data?.items ?? []

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3">
          <Label className="text-xs">Hostel</Label>
          <Select value={hostelId} onValueChange={setHostelId}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Pick a hostel" /></SelectTrigger>
            <SelectContent>
              {list.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name} ({h.gender})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!hostelId ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <Bed className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Pick a hostel to view its floor plan.</p>
          </CardContent>
        </Card>
      ) : rooms.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      ) : (rooms.data?.rooms ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <Bed className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No rooms in this hostel yet — add some in Setup.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rooms.data!.rooms.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Room {r.roomNo}</h3>
                    <Badge variant="outline" className="text-[10px]">
                      {r.beds.filter((b) => b.assignment).length}/{r.capacity} occupied
                    </Badge>
                  </div>
                  <div
                    className="grid gap-1.5"
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(r.capacity, 4)}, minmax(0, 1fr))`,
                    }}
                  >
                    {r.beds.map((b) => (
                      <BedCell
                        key={b.bedNumber}
                        bed={b}
                        onAssign={() =>
                          setAssignTarget({ roomId: r.id, bedNumber: b.bedNumber })
                        }
                        onCheckOut={() => {
                          if (!b.assignment) return
                          if (
                            typeof window !== "undefined" &&
                            !window.confirm(
                              `Check ${b.assignment.student.firstName} ${b.assignment.student.lastName} out of bed ${b.bedNumber}?`,
                            )
                          ) return
                          checkOut.mutate(b.assignment.id)
                        }}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {assignTarget && (
        <AssignDialog
          target={assignTarget}
          hostelGender={rooms.data?.hostel.gender ?? "MIXED"}
          open={!!assignTarget}
          onClose={() => setAssignTarget(null)}
          onSaved={() => {
            setAssignTarget(null)
            qc.invalidateQueries({ queryKey: ["hostel-rooms", hostelId] })
            qc.invalidateQueries({ queryKey: ["hostels"] })
          }}
        />
      )}
    </div>
  )
}

function BedCell({
  bed,
  onAssign,
  onCheckOut,
}: {
  bed: Bed
  onAssign: () => void
  onCheckOut: () => void
}) {
  if (!bed.assignment) {
    return (
      <button
        type="button"
        onClick={onAssign}
        className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        title={`Bed ${bed.bedNumber} — available`}
      >
        <Bed className="h-4 w-4" />
        <span className="text-[10px] font-semibold">#{bed.bedNumber}</span>
      </button>
    )
  }
  const s = bed.assignment.student
  return (
    <div
      className={cn(
        "group relative flex aspect-square flex-col items-center justify-center gap-1 rounded-md border bg-blue-50 p-1 text-blue-900",
      )}
      title={`${s.firstName} ${s.lastName} · ${s.admissionNumber}`}
    >
      <Avatar className="h-6 w-6">
        {s.avatarUrl ? <AvatarImage src={s.avatarUrl} alt="" /> : null}
        <AvatarFallback className="text-[8px]">
          {initials(s.firstName, s.lastName)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-[10px] font-medium leading-tight">
        {s.firstName}
      </span>
      <span className="text-[9px] text-blue-700">#{bed.bedNumber}</span>
      <button
        type="button"
        onClick={onCheckOut}
        className="absolute right-0 top-0 hidden h-5 w-5 items-center justify-center rounded-bl-md bg-destructive text-destructive-foreground hover:opacity-90 group-hover:flex"
        aria-label="Check out"
      >
        <LogOut className="h-3 w-3" />
      </button>
    </div>
  )
}

function AssignDialog({
  target,
  hostelGender,
  open,
  onClose,
  onSaved,
}: {
  target: { roomId: string; bedNumber: number }
  hostelGender: "MALE" | "FEMALE" | "MIXED"
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [q, setQ] = useState("")
  const [student, setStudent] = useState<StudentRow | null>(null)

  const results = useQuery<{ items: StudentRow[] }>({
    queryKey: ["hostel-student-search", q, hostelGender],
    queryFn: async () => {
      const p = new URLSearchParams({ search: q, limit: "10" })
      if (hostelGender !== "MIXED") p.set("gender", hostelGender)
      const res = await fetch(`/api/students?${p}`)
      if (!res.ok) throw new Error("Failed")
      const data = (await res.json()) as {
        items: Array<{
          id: string
          admissionNumber: string
          gender: "MALE" | "FEMALE" | "OTHER" | null
          user: { firstName: string; lastName: string; avatarUrl: string | null }
        }>
      }
      return {
        items: data.items.map((s) => ({
          id: s.id,
          admissionNumber: s.admissionNumber,
          firstName: s.user.firstName,
          lastName: s.user.lastName,
          gender: s.gender,
          avatarUrl: s.user.avatarUrl,
        })),
      }
    },
    enabled: q.trim().length >= 1 && !student,
  })

  const save = useMutation({
    mutationFn: async () => {
      if (!student) throw new Error("Pick a student")
      const res = await fetch("/api/hostel/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          roomId: target.roomId,
          bedNumber: target.bedNumber,
        }),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Failed")
    },
    onSuccess: () => {
      toast.success("Bed assigned")
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign bed #{target.bedNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {student ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
              <Avatar className="h-8 w-8">
                {student.avatarUrl ? <AvatarImage src={student.avatarUrl} alt="" /> : null}
                <AvatarFallback className="text-[10px]">
                  {initials(student.firstName, student.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {student.firstName} {student.lastName}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {student.admissionNumber} · {student.gender ?? "—"}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStudent(null)}>
                Change
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Student ({hostelGender === "MIXED" ? "any gender" : hostelGender.toLowerCase() + " only"})
                </Label>
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by name or admission #"
                />
              </div>
              {q.length >= 1 && (
                <ul className="max-h-40 overflow-y-auto rounded-md border">
                  {results.isLoading ? (
                    <li className="p-2 text-xs text-muted-foreground">Searching…</li>
                  ) : (results.data?.items ?? []).length === 0 ? (
                    <li className="p-2 text-xs text-muted-foreground">No matches</li>
                  ) : (
                    results.data!.items.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 border-b px-2 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={() => setStudent(s)}
                        >
                          <Avatar className="h-6 w-6">
                            {s.avatarUrl ? <AvatarImage src={s.avatarUrl} alt="" /> : null}
                            <AvatarFallback className="text-[10px]">
                              {initials(s.firstName, s.lastName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1 truncate">
                            {s.firstName} {s.lastName}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {s.admissionNumber}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!student || save.isPending}>
            {save.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-1.5 h-4 w-4" />
            )}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
