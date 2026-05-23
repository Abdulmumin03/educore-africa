"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import {
  Download,
  LogOut,
  Printer,
  Search,
  UserPlus,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import { CheckInDialog } from "@/components/dashboard/visitors/check-in-dialog"

type Visitor = {
  id: string
  visitorName: string
  visitorPhone: string | null
  idNumber: string | null
  purpose: string | null
  photoUrl: string | null
  checkedInAt: string
  checkedOutAt: string | null
  host: { id: string; name: string; role: string } | null
}

type Filter = "all" | "checked-in" | "checked-out"

export type Host = { id: string; name: string; role: string }

export function VisitorsManager({
  canExport,
  hosts,
}: {
  canExport: boolean
  hosts: Host[]
}) {
  const qc = useQueryClient()
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"))
  const [q, setQ] = useState("")
  const [status, setStatus] = useState<Filter>("all")
  const [composeOpen, setComposeOpen] = useState(false)

  const list = useQuery<{ items: Visitor[] }>({
    queryKey: ["visitors", date, q, status],
    queryFn: async () => {
      const p = new URLSearchParams()
      if (date) p.set("date", date)
      if (q.trim()) p.set("q", q.trim())
      if (status !== "all") p.set("status", status)
      const res = await fetch(`/api/visitors?${p}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const checkOut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/visitors/${id}/checkout`, { method: "PATCH" })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? "Failed")
      }
    },
    onSuccess: () => {
      toast.success("Checked out")
      qc.invalidateQueries({ queryKey: ["visitors"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const items = list.data?.items ?? []
  const onPremises = items.filter((v) => !v.checkedOutAt).length

  function initials(name: string): string {
    return name
      .split(" ")
      .map((part) => part.charAt(0))
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visitors</h1>
          <p className="text-sm text-muted-foreground">
            Front-desk check-in, badges, and visit log.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canExport && (
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={!date}
            >
              <a
                href={`/api/visitors/export?from=${date}&to=${date}`}
                download
              >
                <Download className="mr-1.5 h-4 w-4" />
                Export day
              </a>
            </Button>
          )}
          <Button size="sm" onClick={() => setComposeOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            Check in visitor
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid items-end gap-3 p-3 sm:grid-cols-[180px_1fr_180px]">
          <div className="space-y-1.5">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, phone, or purpose…"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Filter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="checked-in">On premises</SelectItem>
                <SelectItem value="checked-out">Departed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between p-3 text-sm">
          <span className="text-muted-foreground">
            {items.length} visit{items.length === 1 ? "" : "s"} on {dayjs(date).format("D MMM YYYY")}
          </span>
          <Badge variant="outline" className="text-xs">
            <Users className="mr-1 h-3 w-3" />
            {onPremises} on premises
          </Badge>
        </CardContent>
      </Card>

      {list.isLoading ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No visits match these filters.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="hidden grid-cols-[2fr_2fr_2fr_1fr_1fr_140px] gap-2 border-b px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground sm:grid">
              <div>Visitor</div>
              <div>Purpose</div>
              <div>Host</div>
              <div>In</div>
              <div>Out</div>
              <div className="text-right">Actions</div>
            </div>
            <ul className="divide-y">
              {items.map((v) => (
                <li
                  key={v.id}
                  className="grid items-center gap-2 p-3 sm:grid-cols-[2fr_2fr_2fr_1fr_1fr_140px]"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      {v.photoUrl ? <AvatarImage src={v.photoUrl} alt="" /> : null}
                      <AvatarFallback className="text-[10px]">
                        {initials(v.visitorName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{v.visitorName}</p>
                      {v.visitorPhone && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {v.visitorPhone}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="truncate text-sm">{v.purpose ?? "—"}</div>
                  <div className="truncate text-sm">
                    {v.host?.name ?? "—"}
                    {v.host && (
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        ({v.host.role.replace(/_/g, " ").toLowerCase()})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {dayjs(v.checkedInAt).format("HH:mm")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {v.checkedOutAt ? dayjs(v.checkedOutAt).format("HH:mm") : "—"}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild variant="outline" size="sm">
                      <a href={`/api/visitors/${v.id}/badge`} target="_blank" rel="noopener">
                        <Printer className="mr-1.5 h-3.5 w-3.5" />
                        Badge
                      </a>
                    </Button>
                    {!v.checkedOutAt && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={checkOut.isPending}
                        onClick={() => checkOut.mutate(v.id)}
                      >
                        <LogOut className="mr-1.5 h-3.5 w-3.5" />
                        Out
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {composeOpen && (
        <CheckInDialog
          hosts={hosts}
          onClose={() => setComposeOpen(false)}
          onSaved={() => {
            setComposeOpen(false)
            qc.invalidateQueries({ queryKey: ["visitors"] })
          }}
        />
      )}
    </div>
  )
}
