"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Loader2, MapPin, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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

type Stop = {
  id?: string
  sequence: number
  name: string
  address: string
  latitude: number | null
  longitude: number | null
  scheduledTime: string
}

function emptyStop(sequence: number): Stop {
  return {
    sequence,
    name: "",
    address: "",
    latitude: null,
    longitude: null,
    scheduledTime: "07:00",
  }
}

export function RoutesTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient()
  const [routeId, setRouteId] = useState<string>("")
  const [stops, setStops] = useState<Stop[]>([])

  const list = useQuery<{ items: Route[] }>({
    queryKey: ["transport-routes"],
    queryFn: async () => {
      const res = await fetch("/api/transport/routes")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const route = useMemo(
    () => list.data?.items.find((r) => r.id === routeId) ?? null,
    [list.data, routeId],
  )

  // Sync server stops into local editor state whenever the picked route changes.
  useEffect(() => {
    if (!route) {
      setStops([])
      return
    }
    setStops(
      route.stops.length > 0
        ? route.stops.map((s) => ({
            id: s.id,
            sequence: s.sequence,
            name: s.name,
            address: s.address ?? "",
            latitude: s.latitude,
            longitude: s.longitude,
            scheduledTime: s.scheduledTime,
          }))
        : [emptyStop(1)],
    )
  }, [route])

  const save = useMutation({
    mutationFn: async () => {
      const cleaned = stops
        .filter((s) => s.name.trim().length >= 1)
        .map((s, i) => ({ ...s, sequence: i + 1, name: s.name.trim() }))
      if (cleaned.length === 0) throw new Error("Add at least one stop")
      const res = await fetch(`/api/transport/routes/${routeId}/stops`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stops: cleaned.map((s) => ({
            sequence: s.sequence,
            name: s.name,
            address: s.address.trim() || null,
            latitude: s.latitude,
            longitude: s.longitude,
            scheduledTime: s.scheduledTime,
          })),
          replace: true,
        }),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Failed")
    },
    onSuccess: () => {
      toast.success("Stops saved")
      qc.invalidateQueries({ queryKey: ["transport-routes"] })
      qc.invalidateQueries({ queryKey: ["transport-routes-detail"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= stops.length) return
    setStops((prev) => {
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((s, i) => ({ ...s, sequence: i + 1 }))
    })
  }

  function update(i: number, patch: Partial<Stop>) {
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  function remove(i: number) {
    setStops((prev) =>
      prev
        .filter((_, idx) => idx !== i)
        .map((s, idx) => ({ ...s, sequence: idx + 1 })),
    )
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3">
          <Label className="text-xs">Route</Label>
          <Select value={routeId} onValueChange={setRouteId}>
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="Pick a route" />
            </SelectTrigger>
            <SelectContent>
              {(list.data?.items ?? []).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name} ({r.busPlateNo})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!routeId ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <MapPin className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Pick a route to edit its stops.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-3 p-3">
            <ul className="space-y-2">
              {stops.map((s, i) => (
                <li key={i} className="rounded-md border bg-card p-2">
                  <div className="grid gap-2 sm:grid-cols-[40px_1fr_1fr_100px_auto]">
                    <div className="flex items-center justify-center text-xs font-semibold text-muted-foreground">
                      {s.sequence}
                    </div>
                    <Input
                      value={s.name}
                      onChange={(e) => update(i, { name: e.target.value })}
                      placeholder="Stop name (e.g. Lekki Phase 1 gate)"
                      disabled={!isAdmin}
                    />
                    <Input
                      value={s.address}
                      onChange={(e) => update(i, { address: e.target.value })}
                      placeholder="Address (optional)"
                      disabled={!isAdmin}
                    />
                    <Input
                      type="time"
                      value={s.scheduledTime}
                      onChange={(e) => update(i, { scheduledTime: e.target.value })}
                      disabled={!isAdmin}
                    />
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          aria-label="Move up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => move(i, 1)}
                          disabled={i === stops.length - 1}
                          aria-label="Move down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => remove(i)}
                          disabled={stops.length <= 1}
                          aria-label="Remove"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Input
                      type="number"
                      step="any"
                      value={s.latitude ?? ""}
                      onChange={(e) =>
                        update(i, {
                          latitude: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      placeholder="Latitude (optional)"
                      disabled={!isAdmin}
                    />
                    <Input
                      type="number"
                      step="any"
                      value={s.longitude ?? ""}
                      onChange={(e) =>
                        update(i, {
                          longitude: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      placeholder="Longitude (optional)"
                      disabled={!isAdmin}
                    />
                  </div>
                </li>
              ))}
            </ul>
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setStops((prev) => [...prev, emptyStop(prev.length + 1)])
                  }
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add stop
                </Button>
                <Button
                  size="sm"
                  onClick={() => save.mutate()}
                  disabled={save.isPending}
                  className="ml-auto"
                >
                  {save.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  Save stops
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
