"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BedDouble, Building2, Loader2, Plus, Trash2, Users } from "lucide-react"
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

type Hostel = {
  id: string
  name: string
  gender: "MALE" | "FEMALE" | "MIXED"
  capacity: number
  roomCount: number
  totalBeds: number
  occupied: number
  available: number
  hostelMaster: { id: string; name: string } | null
}

type Houseparent = { id: string; name: string }
const ANY_HOUSEPARENT = "NONE"

export function HostelSetupTab({
  isAdmin,
  houseparents,
}: {
  isAdmin: boolean
  houseparents: Houseparent[]
}) {
  const qc = useQueryClient()
  const [composeOpen, setComposeOpen] = useState(false)
  const [editing, setEditing] = useState<Hostel | null>(null)
  const [roomFor, setRoomFor] = useState<Hostel | null>(null)

  const list = useQuery<{ items: Hostel[] }>({
    queryKey: ["hostels"],
    queryFn: async () => {
      const res = await fetch("/api/hostel/hostels")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/hostel/hostels/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? "Delete failed")
      }
    },
    onSuccess: () => {
      toast.success("Hostel removed")
      qc.invalidateQueries({ queryKey: ["hostels"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const items = list.data?.items ?? []
  const totals = items.reduce(
    (s, h) => ({
      beds: s.beds + h.totalBeds,
      occupied: s.occupied + h.occupied,
    }),
    { beds: 0, occupied: 0 },
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Hostels" value={items.length} />
        <StatCard label="Beds" value={totals.beds} />
        <StatCard
          label="Occupied"
          value={`${totals.occupied} (${totals.beds ? Math.round((totals.occupied / totals.beds) * 100) : 0}%)`}
        />
      </div>
      <div className="flex justify-end">
        {isAdmin && (
          <Button size="sm" onClick={() => setComposeOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add hostel
          </Button>
        )}
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
            <Building2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No hostels yet.</p>
            {isAdmin && (
              <Button size="sm" className="mt-2" onClick={() => setComposeOpen(true)}>
                Add the first one
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((h) => (
            <li key={h.id}>
              <Card>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold">{h.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {h.hostelMaster ? `Houseparent: ${h.hostelMaster.name}` : "No houseparent"}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(h)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            if (typeof window !== "undefined" && !window.confirm(`Delete ${h.name}?`)) return
                            remove.mutate(h.id)
                          }}
                          aria-label="Delete"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {h.gender}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      <BedDouble className="mr-1 h-3 w-3" /> {h.totalBeds} beds
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      <Users className="mr-1 h-3 w-3" /> {h.occupied} occupied
                    </Badge>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${h.totalBeds ? Math.round((h.occupied / h.totalBeds) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{h.roomCount} rooms</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRoomFor(h)}
                    >
                      Manage rooms
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {(composeOpen || editing) && (
        <HostelDialog
          mode={editing ? "edit" : "create"}
          initial={editing}
          houseparents={houseparents}
          open={composeOpen || !!editing}
          onClose={() => {
            setComposeOpen(false)
            setEditing(null)
          }}
          onSaved={() => {
            setComposeOpen(false)
            setEditing(null)
            qc.invalidateQueries({ queryKey: ["hostels"] })
          }}
        />
      )}
      {roomFor && (
        <RoomsDialog
          hostel={roomFor}
          isAdmin={isAdmin}
          open={!!roomFor}
          onClose={() => setRoomFor(null)}
        />
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}

function HostelDialog({
  mode,
  initial,
  houseparents,
  open,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit"
  initial: Hostel | null
  houseparents: Houseparent[]
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [gender, setGender] = useState<"MALE" | "FEMALE" | "MIXED">(initial?.gender ?? "MALE")
  const [hostelMasterId, setHostelMasterId] = useState(
    initial?.hostelMaster?.id ?? ANY_HOUSEPARENT,
  )
  const [capacity, setCapacity] = useState(initial?.capacity ?? 0)

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        gender,
        hostelMasterId: hostelMasterId === ANY_HOUSEPARENT ? null : hostelMasterId,
        capacity,
      }
      const url =
        mode === "edit" && initial
          ? `/api/hostel/hostels/${initial.id}`
          : "/api/hostel/hostels"
      const res = await fetch(url, {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Save failed")
    },
    onSuccess: () => {
      toast.success(mode === "edit" ? "Saved" : "Hostel created")
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit hostel" : "New hostel"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Gender</Label>
              <Select value={gender} onValueChange={(v) => setGender(v as "MALE" | "FEMALE" | "MIXED")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Boys</SelectItem>
                  <SelectItem value="FEMALE">Girls</SelectItem>
                  <SelectItem value="MIXED">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Capacity (optional)</Label>
              <Input
                type="number"
                min={0}
                value={capacity}
                onChange={(e) => setCapacity(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Houseparent</Label>
            <Select value={hostelMasterId} onValueChange={setHostelMasterId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_HOUSEPARENT}>None</SelectItem>
                {houseparents.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
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
            disabled={name.trim().length < 2 || save.isPending}
          >
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const NO_DORM = "NONE"

function RoomsDialog({
  hostel,
  isAdmin,
  open,
  onClose,
}: {
  hostel: Hostel
  isAdmin: boolean
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [roomNo, setRoomNo] = useState("")
  const [capacity, setCapacity] = useState(4)
  const [dormId, setDormId] = useState(NO_DORM)
  const [newDormName, setNewDormName] = useState("")

  const rooms = useQuery<{
    rooms: {
      id: string
      roomNo: string
      capacity: number
      dorm: { id: string; name: string } | null
      beds: { bedNumber: number; assignment: unknown }[]
    }[]
  }>({
    queryKey: ["hostel-rooms", hostel.id],
    queryFn: async () => {
      const res = await fetch(`/api/hostel/rooms?hostelId=${hostel.id}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const dorms = useQuery<{
    items: { id: string; name: string; roomCount: number; totalBeds: number; occupied: number }[]
  }>({
    queryKey: ["hostel-dorms", hostel.id],
    queryFn: async () => {
      const res = await fetch(`/api/hostel/dorms?hostelId=${hostel.id}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const addDorm = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/hostel/dorms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostelId: hostel.id, name: newDormName.trim() }),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Failed")
    },
    onSuccess: () => {
      setNewDormName("")
      qc.invalidateQueries({ queryKey: ["hostel-dorms", hostel.id] })
      toast.success("Dorm added")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const removeDorm = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/hostel/dorms/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? "Failed")
      }
    },
    onSuccess: () => {
      if (dormId !== NO_DORM) setDormId(NO_DORM)
      qc.invalidateQueries({ queryKey: ["hostel-dorms", hostel.id] })
      qc.invalidateQueries({ queryKey: ["hostel-rooms", hostel.id] })
      toast.success("Dorm removed (rooms remain).")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/hostel/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hostelId: hostel.id,
          dormId: dormId === NO_DORM ? null : dormId,
          roomNo: roomNo.trim(),
          capacity,
        }),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Failed")
    },
    onSuccess: () => {
      setRoomNo("")
      qc.invalidateQueries({ queryKey: ["hostel-rooms", hostel.id] })
      qc.invalidateQueries({ queryKey: ["hostel-dorms", hostel.id] })
      qc.invalidateQueries({ queryKey: ["hostels"] })
      toast.success("Room added")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/hostel/rooms/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? "Failed")
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hostel-rooms", hostel.id] })
      qc.invalidateQueries({ queryKey: ["hostels"] })
      toast.success("Room removed")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const dormItems = dorms.data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{hostel.name} — Dorms & Rooms</DialogTitle>
        </DialogHeader>

        {isAdmin && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-2">
            <p className="text-xs font-semibold text-muted-foreground">Dorms (optional)</p>
            {dormItems.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Group rooms into dorms (e.g. Wing A, Block 2). Rooms can also live ungrouped.
              </p>
            ) : (
              <ul className="space-y-1">
                {dormItems.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1 text-xs"
                  >
                    <span className="font-medium">{d.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {d.roomCount} rooms · {d.occupied}/{d.totalBeds} beds
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        if (typeof window !== "undefined" && !window.confirm(`Delete dorm "${d.name}"? Rooms stay.`)) return
                        removeDorm.mutate(d.id)
                      }}
                      aria-label="Delete dorm"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={newDormName}
                onChange={(e) => setNewDormName(e.target.value)}
                placeholder="New dorm name (e.g. Wing A)"
                maxLength={60}
              />
              <Button
                size="sm"
                onClick={() => addDorm.mutate()}
                disabled={newDormName.trim().length < 1 || addDorm.isPending}
              >
                {addDorm.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="grid items-end gap-2 sm:grid-cols-[1fr_140px_120px_auto]">
            <div className="space-y-1.5">
              <Label className="text-xs">Room number</Label>
              <Input
                value={roomNo}
                onChange={(e) => setRoomNo(e.target.value)}
                placeholder="e.g. 12A"
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dorm</Label>
              <Select value={dormId} onValueChange={setDormId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DORM}>None</SelectItem>
                  {dormItems.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Beds</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={capacity}
                onChange={(e) => setCapacity(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <Button
              onClick={() => add.mutate()}
              disabled={roomNo.trim().length === 0 || add.isPending}
            >
              {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        )}

        {rooms.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (rooms.data?.rooms ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No rooms yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {rooms.data!.rooms.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <span className="font-medium">Room {r.roomNo}</span>
                {r.dorm && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {r.dorm.name}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {r.beds.filter((b) => b.assignment).length}/{r.capacity} beds occupied
                </span>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      if (typeof window !== "undefined" && !window.confirm(`Delete Room ${r.roomNo}?`)) return
                      remove.mutate(r.id)
                    }}
                    aria-label="Delete"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
