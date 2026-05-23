"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Bus, Check, CircleDot, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
import type { Route } from "@/components/dashboard/transport/fleet-tab"

type RosterItem = {
  studentId: string
  admissionNumber: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  stop: { id: string; name: string; sequence: number }
  boardedAt: string | null
}

function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

export function BoardTab() {
  const qc = useQueryClient()
  const [routeId, setRouteId] = useState<string>("")

  const routes = useQuery<{ items: Route[] }>({
    queryKey: ["transport-routes"],
    queryFn: async () => {
      const res = await fetch("/api/transport/routes")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const roster = useQuery<{ route: { id: string; name: string }; items: RosterItem[] }>({
    queryKey: ["transport-board", routeId],
    queryFn: async () => {
      const res = await fetch(`/api/transport/board?routeId=${routeId}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: !!routeId,
    refetchInterval: 30_000,
  })

  const board = useMutation({
    mutationFn: async (studentId: string) => {
      const res = await fetch("/api/transport/board", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId }),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string; deduped?: boolean }
      if (!res.ok) throw new Error(b.error ?? "Failed")
      return b
    },
    onSuccess: (b) => {
      if (b.deduped) {
        toast.info("Already boarded today")
      } else {
        toast.success("Boarded — parent notified")
      }
      qc.invalidateQueries({ queryKey: ["transport-board", routeId] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const items = roster.data?.items ?? []
  const boardedCount = items.filter((i) => i.boardedAt).length

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3">
          <Label className="text-xs">Route</Label>
          <Select value={routeId} onValueChange={setRouteId}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Pick a route" /></SelectTrigger>
            <SelectContent>
              {(routes.data?.items ?? []).map((r) => (
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
            <Bus className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Pick a route to load the boarding roster.
            </p>
          </CardContent>
        </Card>
      ) : roster.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading roster…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            No students assigned to this route yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex items-center justify-between p-3 text-sm">
              <span className="text-muted-foreground">
                {dayjs().format("D MMM YYYY")} · roster for {roster.data?.route.name}
              </span>
              <Badge variant="outline" className="text-xs">
                {boardedCount}/{items.length} boarded
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {items.map((s) => {
                  const isBoarded = !!s.boardedAt
                  return (
                    <li key={s.studentId} className="flex items-center gap-3 p-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        {s.avatarUrl ? <AvatarImage src={s.avatarUrl} alt="" /> : null}
                        <AvatarFallback className="text-[10px]">
                          {initials(s.firstName, s.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {s.firstName} {s.lastName}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {s.admissionNumber} · {s.stop.sequence}. {s.stop.name}
                        </p>
                      </div>
                      {isBoarded ? (
                        <Badge className="text-[10px]">
                          <Check className="mr-1 h-3 w-3" />
                          {dayjs(s.boardedAt).format("HH:mm")}
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => board.mutate(s.studentId)}
                          disabled={board.isPending}
                        >
                          <CircleDot className="mr-1.5 h-4 w-4" />
                          Mark boarded
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
