"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Bus, Loader2, MapPinned, Send } from "lucide-react"
import L from "leaflet"
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
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
import "leaflet/dist/leaflet.css"

// Fix the default-marker icon URLs — Leaflet's defaults assume images from
// the dist folder, which Webpack rewrites and breaks. Inline replacements
// keep tooling out of it.
const busIcon = L.divIcon({
  className: "",
  html: `<div style="background:#0D2B5E;color:white;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:14px;">🚌</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

const LAGOS_CENTRE: [number, number] = [6.5244, 3.3792]

type LiveItem = {
  routeId: string
  name: string
  busPlateNo: string
  driverName: string | null
  position: {
    latitude: number
    longitude: number
    speedKph: number | null
    recordedAt: string
    live: boolean
  } | null
}

export function LiveMapTab() {
  const live = useQuery<{ items: LiveItem[]; now: string }>({
    queryKey: ["transport-live"],
    queryFn: async () => {
      const res = await fetch("/api/transport/live-locations")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    refetchInterval: 15_000,
  })

  const items = live.data?.items ?? []
  const withPos = items.filter((i) => !!i.position)

  // Compute map centre from the average of bus positions, or default to Lagos.
  const centre: [number, number] = useMemo(() => {
    if (withPos.length === 0) return LAGOS_CENTRE
    const lat = withPos.reduce((s, i) => s + (i.position?.latitude ?? 0), 0) / withPos.length
    const lng = withPos.reduce((s, i) => s + (i.position?.longitude ?? 0), 0) / withPos.length
    return [lat, lng]
  }, [withPos])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {live.isLoading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Connecting…
            </span>
          ) : (
            <>
              {withPos.length}/{items.length} buses tracked · refreshing every 15 s
            </>
          )}
        </div>
        <SimulatePing items={items} onSent={() => live.refetch()} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="h-[500px] w-full overflow-hidden rounded-md">
            <MapContainer
              center={centre}
              zoom={11}
              scrollWheelZoom
              className="h-full w-full"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png"
              />
              <RecentreOnData items={withPos} />
              {withPos.map((i) => (
                <Marker
                  key={i.routeId}
                  position={[i.position!.latitude, i.position!.longitude]}
                  icon={busIcon}
                >
                  <Popup>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{i.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.busPlateNo}
                        {i.driverName ? ` · ${i.driverName}` : ""}
                      </p>
                      <p className="text-xs">
                        {i.position!.speedKph != null
                          ? `${i.position!.speedKph} km/h · `
                          : ""}
                        {dayjs(i.position!.recordedAt).format("HH:mm:ss")}
                      </p>
                      {!i.position!.live && (
                        <p className="text-[11px] text-amber-700">Cached (no recent ping)</p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {items.map((i) => (
                <li key={i.routeId} className="flex items-center gap-3 p-3">
                  <Bus className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {i.busPlateNo}
                      {i.driverName ? ` · ${i.driverName}` : ""}
                    </p>
                  </div>
                  {i.position ? (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${i.position.live ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                    >
                      <MapPinned className="mr-1 h-3 w-3" />
                      {dayjs(i.position.recordedAt).format("HH:mm:ss")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      No data
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function RecentreOnData({ items }: { items: LiveItem[] }) {
  const map = useMap()
  useEffect(() => {
    if (items.length === 0) return
    const positions = items
      .filter((i) => !!i.position)
      .map((i) => [i.position!.latitude, i.position!.longitude] as [number, number])
    if (positions.length === 0) return
    const bounds = L.latLngBounds(positions)
    map.fitBounds(bounds.pad(0.3), { animate: false })
    // Only fit on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length > 0])
  return null
}

/**
 * Dev/test helper — lets an admin POST a fake GPS ping for any route from the
 * map UI so they can confirm the pipe works without a live driver app.
 */
function SimulatePing({
  items,
  onSent,
}: {
  items: LiveItem[]
  onSent: () => void
}) {
  const [open, setOpen] = useState(false)
  const [routeId, setRouteId] = useState("")
  const [lat, setLat] = useState("6.5244")
  const [lng, setLng] = useState("3.3792")
  const [speed, setSpeed] = useState("30")

  const send = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/transport/update-location", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          routeId,
          latitude: Number(lat),
          longitude: Number(lng),
          speedKph: Number(speed),
        }),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Failed")
    },
    onSuccess: () => {
      toast.success("Position sent")
      onSent()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Simulate driver ping
      </Button>
    )
  }

  return (
    <Card className="w-full">
      <CardContent className="grid items-end gap-2 p-3 sm:grid-cols-[1fr_120px_120px_100px_auto_auto]">
        <div className="space-y-1.5">
          <Label className="text-xs">Route</Label>
          <Select value={routeId} onValueChange={setRouteId}>
            <SelectTrigger><SelectValue placeholder="Pick a route" /></SelectTrigger>
            <SelectContent>
              {items.map((i) => (
                <SelectItem key={i.routeId} value={i.routeId}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Lat</Label>
          <Input value={lat} onChange={(e) => setLat(e.target.value)} type="number" step="any" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Lng</Label>
          <Input value={lng} onChange={(e) => setLng(e.target.value)} type="number" step="any" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">km/h</Label>
          <Input value={speed} onChange={(e) => setSpeed(e.target.value)} type="number" />
        </div>
        <Button
          size="sm"
          onClick={() => send.mutate()}
          disabled={!routeId || send.isPending}
        >
          {send.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1.5 h-4 w-4" />
          )}
          Send
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Done
        </Button>
      </CardContent>
    </Card>
  )
}
