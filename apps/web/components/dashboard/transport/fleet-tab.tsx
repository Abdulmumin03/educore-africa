"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bus, Loader2, Pencil, Plus, Trash2, Users } from "lucide-react"
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

const NO_DRIVER = "NONE"

export type Route = {
  id: string
  name: string
  busPlateNo: string
  make: string | null
  model: string | null
  driverName: string | null
  driverPhone: string | null
  driverStaff: { id: string; name: string } | null
  capacity: number
  stops: {
    id: string
    sequence: number
    name: string
    address: string | null
    latitude: number | null
    longitude: number | null
    scheduledTime: string
  }[]
  assignedCount: number
}

export function FleetTab({
  isAdmin,
  drivers,
}: {
  isAdmin: boolean
  drivers: { id: string; name: string }[]
}) {
  const qc = useQueryClient()
  const [composeOpen, setComposeOpen] = useState(false)
  const [editing, setEditing] = useState<Route | null>(null)

  const list = useQuery<{ items: Route[] }>({
    queryKey: ["transport-routes"],
    queryFn: async () => {
      const res = await fetch("/api/transport/routes")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/transport/routes/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? "Failed")
      }
    },
    onSuccess: () => {
      toast.success("Route removed")
      qc.invalidateQueries({ queryKey: ["transport-routes"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const items = list.data?.items ?? []

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {isAdmin && (
          <Button size="sm" onClick={() => setComposeOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add bus / route
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
            <Bus className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No buses yet.</p>
            {isAdmin && (
              <Button size="sm" className="mt-2" onClick={() => setComposeOpen(true)}>
                Add the first one
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold">{r.name}</h3>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.busPlateNo}
                        {r.make ? ` · ${r.make}` : ""}
                        {r.model ? ` ${r.model}` : ""}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditing(r)} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            if (typeof window !== "undefined" && !window.confirm(`Delete ${r.name}?`)) return
                            remove.mutate(r.id)
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
                    <Badge variant="outline" className="text-[10px]">
                      <Users className="mr-1 h-3 w-3" />
                      {r.assignedCount}/{r.capacity} students
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {r.stops.length} stops
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Driver:{" "}
                    {r.driverStaff?.name ?? r.driverName ?? "—"}
                    {r.driverPhone ? ` · ${r.driverPhone}` : ""}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {(composeOpen || editing) && (
        <RouteDialog
          mode={editing ? "edit" : "create"}
          initial={editing}
          drivers={drivers}
          onClose={() => {
            setComposeOpen(false)
            setEditing(null)
          }}
          onSaved={() => {
            setComposeOpen(false)
            setEditing(null)
            qc.invalidateQueries({ queryKey: ["transport-routes"] })
          }}
        />
      )}
    </div>
  )
}

function RouteDialog({
  mode,
  initial,
  drivers,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit"
  initial: Route | null
  drivers: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [busPlateNo, setBusPlateNo] = useState(initial?.busPlateNo ?? "")
  const [make, setMake] = useState(initial?.make ?? "")
  const [model, setModel] = useState(initial?.model ?? "")
  const [capacity, setCapacity] = useState(initial?.capacity ?? 20)
  const [driverStaffId, setDriverStaffId] = useState(initial?.driverStaff?.id ?? NO_DRIVER)
  const [driverName, setDriverName] = useState(initial?.driverName ?? "")
  const [driverPhone, setDriverPhone] = useState(initial?.driverPhone ?? "")

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        busPlateNo: busPlateNo.trim(),
        make: make.trim() || null,
        model: model.trim() || null,
        capacity,
        driverStaffId: driverStaffId === NO_DRIVER ? null : driverStaffId,
        driverName: driverName.trim() || null,
        driverPhone: driverPhone.trim() || null,
      }
      const url =
        mode === "edit" && initial
          ? `/api/transport/routes/${initial.id}`
          : "/api/transport/routes"
      const res = await fetch(url, {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Failed")
    },
    onSuccess: () => {
      toast.success(mode === "edit" ? "Saved" : "Route added")
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit route" : "New route"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Route name">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Lekki–Ikoyi Route 1" />
            </Field>
            <Field label="Plate number">
              <Input
                value={busPlateNo}
                onChange={(e) => setBusPlateNo(e.target.value.toUpperCase())}
                maxLength={20}
                placeholder="e.g. LSD-123-XX"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Make">
              <Input value={make} onChange={(e) => setMake(e.target.value)} maxLength={40} />
            </Field>
            <Field label="Model">
              <Input value={model} onChange={(e) => setModel(e.target.value)} maxLength={40} />
            </Field>
            <Field label="Capacity">
              <Input
                type="number"
                min={1}
                max={120}
                value={capacity}
                onChange={(e) => setCapacity(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
          </div>
          <Field label="Driver (staff)">
            <Select value={driverStaffId} onValueChange={setDriverStaffId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DRIVER}>External / not on staff</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {driverStaffId === NO_DRIVER && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Driver name">
                <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} maxLength={80} />
              </Field>
              <Field label="Driver phone">
                <Input
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  maxLength={20}
                  placeholder="+234…"
                />
              </Field>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={
              name.trim().length < 2 ||
              busPlateNo.trim().length < 2 ||
              save.isPending
            }
          >
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save
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
