"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Search, Trash2, UserPlus } from "lucide-react"
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
import type { Route } from "@/components/dashboard/transport/fleet-tab"

type Assignment = {
  id: string
  student: {
    id: string
    admissionNumber: string
    firstName: string
    lastName: string
    avatarUrl: string | null
  }
  route: { id: string; name: string; busPlateNo: string }
  stop: { id: string; name: string; scheduledTime: string }
}

type StudentRow = {
  id: string
  admissionNumber: string
  firstName: string
  lastName: string
  avatarUrl: string | null
}

function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

export function TransportAssignmentsTab() {
  const qc = useQueryClient()
  const [composeOpen, setComposeOpen] = useState(false)

  const list = useQuery<{ items: Assignment[] }>({
    queryKey: ["transport-assignments"],
    queryFn: async () => {
      const res = await fetch("/api/transport/assignments")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/transport/assignments/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? "Failed")
      }
    },
    onSuccess: () => {
      toast.success("Removed")
      qc.invalidateQueries({ queryKey: ["transport-assignments"] })
      qc.invalidateQueries({ queryKey: ["transport-routes"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const items = list.data?.items ?? []

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setComposeOpen(true)}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          Assign student
        </Button>
      </div>

      {list.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
            No students assigned to a route yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {items.map((a) => (
                <li key={a.id} className="flex items-center gap-3 p-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    {a.student.avatarUrl ? <AvatarImage src={a.student.avatarUrl} alt="" /> : null}
                    <AvatarFallback className="text-[10px]">
                      {initials(a.student.firstName, a.student.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {a.student.firstName} {a.student.lastName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {a.student.admissionNumber} → {a.route.name} ({a.route.busPlateNo})
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {a.stop.name} · {a.stop.scheduledTime}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      if (typeof window !== "undefined" && !window.confirm("Unassign this student?")) return
                      remove.mutate(a.id)
                    }}
                    aria-label="Unassign"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {composeOpen && (
        <AssignDialog
          onClose={() => setComposeOpen(false)}
          onSaved={() => {
            setComposeOpen(false)
            qc.invalidateQueries({ queryKey: ["transport-assignments"] })
            qc.invalidateQueries({ queryKey: ["transport-routes"] })
          }}
        />
      )}
    </div>
  )
}

function AssignDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [q, setQ] = useState("")
  const [student, setStudent] = useState<StudentRow | null>(null)
  const [routeId, setRouteId] = useState("")
  const [stopId, setStopId] = useState("")

  const routes = useQuery<{ items: Route[] }>({
    queryKey: ["transport-routes"],
    queryFn: async () => {
      const res = await fetch("/api/transport/routes")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const stops = useMemo(
    () => routes.data?.items.find((r) => r.id === routeId)?.stops ?? [],
    [routes.data, routeId],
  )

  const studentSearch = useQuery<{ items: StudentRow[] }>({
    queryKey: ["transport-student-search", q],
    queryFn: async () => {
      const res = await fetch(`/api/students?search=${encodeURIComponent(q)}&limit=10`)
      if (!res.ok) throw new Error("Failed")
      const data = (await res.json()) as {
        items: Array<{
          id: string
          admissionNumber: string
          user: { firstName: string; lastName: string; avatarUrl: string | null }
        }>
      }
      return {
        items: data.items.map((s) => ({
          id: s.id,
          admissionNumber: s.admissionNumber,
          firstName: s.user.firstName,
          lastName: s.user.lastName,
          avatarUrl: s.user.avatarUrl,
        })),
      }
    },
    enabled: q.trim().length >= 1 && !student,
  })

  const save = useMutation({
    mutationFn: async () => {
      if (!student || !routeId || !stopId) throw new Error("Pick all three")
      const res = await fetch("/api/transport/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId: student.id, routeId, stopId }),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Failed")
    },
    onSuccess: () => {
      toast.success("Assigned")
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign student to route</DialogTitle>
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
                  {student.admissionNumber}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStudent(null)}>
                Change
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Student</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by name or admission #"
                    className="pl-8"
                  />
                </div>
              </div>
              {q.length >= 1 && (
                <ul className="max-h-40 overflow-y-auto rounded-md border">
                  {studentSearch.isLoading ? (
                    <li className="p-2 text-xs text-muted-foreground">Searching…</li>
                  ) : (studentSearch.data?.items ?? []).length === 0 ? (
                    <li className="p-2 text-xs text-muted-foreground">No matches</li>
                  ) : (
                    studentSearch.data!.items.map((s) => (
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

          <div className="space-y-1.5">
            <Label className="text-xs">Route</Label>
            <Select
              value={routeId}
              onValueChange={(v) => {
                setRouteId(v)
                setStopId("")
              }}
            >
              <SelectTrigger><SelectValue placeholder="Pick a route" /></SelectTrigger>
              <SelectContent>
                {(routes.data?.items ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} ({r.busPlateNo})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Pickup stop</Label>
            <Select value={stopId} onValueChange={setStopId} disabled={!routeId}>
              <SelectTrigger>
                <SelectValue placeholder={routeId ? "Pick a stop" : "Pick a route first"} />
              </SelectTrigger>
              <SelectContent>
                {stops.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.sequence}. {s.name} · {s.scheduledTime}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!student || !routeId || !stopId || save.isPending}
          >
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
