"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Loader2, Plus, Wrench } from "lucide-react"
import { toast } from "sonner"
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
import { Textarea } from "@/components/ui/textarea"

type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "DECLINED"

type Hostel = { id: string; name: string }
type Room = { id: string; roomNo: string }
type MaintenanceItem = {
  id: string
  hostel: { id: string; name: string }
  room: { id: string; roomNo: string } | null
  issueType: string
  description: string
  status: Status
  reportedBy: string
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
}

const STATUS_STYLE: Record<Status, string> = {
  OPEN: "bg-amber-100 text-amber-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-muted text-muted-foreground",
}

export function HostelMaintenanceTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient()
  const [composeOpen, setComposeOpen] = useState(false)

  const list = useQuery<{ items: MaintenanceItem[] }>({
    queryKey: ["hostel-maintenance"],
    queryFn: async () => {
      const res = await fetch("/api/hostel/maintenance")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const res = await fetch(`/api/hostel/maintenance/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Failed")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hostel-maintenance"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const items = list.data?.items ?? []

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setComposeOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Report issue
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
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <Wrench className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No maintenance requests.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <li key={m.id}>
              <Card>
                <CardContent className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[m.status]}`}>
                      {m.status.replace("_", " ")}
                    </Badge>
                    <span className="text-sm font-semibold">
                      {m.issueType} · {m.hostel.name}
                      {m.room ? ` · Room ${m.room.roomNo}` : ""}
                    </span>
                  </div>
                  <p className="text-sm">{m.description}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>
                      Reported by {m.reportedBy} · {dayjs(m.createdAt).format("D MMM YYYY")}
                    </span>
                    <div className="flex gap-1">
                      {m.status === "OPEN" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={update.isPending}
                          onClick={() => update.mutate({ id: m.id, status: "IN_PROGRESS" })}
                        >
                          Start work
                        </Button>
                      )}
                      {isAdmin && m.status !== "RESOLVED" && m.status !== "DECLINED" && (
                        <>
                          <Button
                            size="sm"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: m.id, status: "RESOLVED" })}
                          >
                            Resolve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: m.id, status: "DECLINED" })}
                          >
                            Decline
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {composeOpen && (
        <MaintenanceDialog
          onClose={() => setComposeOpen(false)}
          onSaved={() => {
            setComposeOpen(false)
            qc.invalidateQueries({ queryKey: ["hostel-maintenance"] })
          }}
        />
      )}
    </div>
  )
}

function MaintenanceDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const ANY_ROOM = "NONE"
  const [hostelId, setHostelId] = useState("")
  const [roomId, setRoomId] = useState(ANY_ROOM)
  const [issueType, setIssueType] = useState("")
  const [description, setDescription] = useState("")

  const hostels = useQuery<{ items: Hostel[] }>({
    queryKey: ["hostels"],
    queryFn: async () => {
      const res = await fetch("/api/hostel/hostels")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })
  const rooms = useQuery<{ rooms: Room[] }>({
    queryKey: ["hostel-rooms", hostelId],
    queryFn: async () => {
      const res = await fetch(`/api/hostel/rooms?hostelId=${hostelId}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: !!hostelId,
  })

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/hostel/maintenance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hostelId,
          roomId: roomId === ANY_ROOM ? null : roomId,
          issueType: issueType.trim(),
          description: description.trim(),
        }),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Failed")
    },
    onSuccess: () => {
      toast.success("Reported")
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Report maintenance issue</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Hostel</Label>
              <Select
                value={hostelId}
                onValueChange={(v) => {
                  setHostelId(v)
                  setRoomId(ANY_ROOM)
                }}
              >
                <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent>
                  {(hostels.data?.items ?? []).map((h) => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Room (optional)</Label>
              <Select value={roomId} onValueChange={setRoomId} disabled={!hostelId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_ROOM}>None</SelectItem>
                  {(rooms.data?.rooms ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>Room {r.roomNo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Issue type</Label>
            <Input
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
              placeholder="e.g. Plumbing, Electrical, Furniture"
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the problem and where it is."
              maxLength={2000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={
              !hostelId ||
              issueType.trim().length < 2 ||
              description.trim().length < 2 ||
              save.isPending
            }
          >
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
