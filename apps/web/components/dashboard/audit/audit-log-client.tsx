"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Loader2,
  Search,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
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

type AuditRow = {
  id: string
  createdAt: string
  user: { id: string; name: string; role: string } | null
  action: string
  entityType: string
  entityId: string | null
  ipAddress: string | null
  userAgent: string | null
  payload: unknown
}

type Response = {
  total: number
  page: number
  limit: number
  facets: { entityTypes: string[]; actions: string[] }
  items: AuditRow[]
}

const ANY = "ANY"

export function AuditLogClient() {
  const [q, setQ] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [entityType, setEntityType] = useState(ANY)
  const [action, setAction] = useState(ANY)
  const [page, setPage] = useState(1)
  const [viewing, setViewing] = useState<AuditRow | null>(null)

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (q.trim()) p.set("q", q.trim())
    if (from) p.set("from", from)
    if (to) p.set("to", to)
    if (entityType !== ANY) p.set("entityType", entityType)
    if (action !== ANY) p.set("action", action)
    p.set("page", String(page))
    return p.toString()
  }, [q, from, to, entityType, action, page])

  const list = useQuery<Response>({
    queryKey: ["audit-log", query],
    queryFn: async () => {
      const res = await fetch(`/api/audit-log?${query}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const exportHref = useMemo(() => {
    const p = new URLSearchParams()
    if (from) p.set("from", from)
    if (to) p.set("to", to)
    return `/api/audit-log/export?${p.toString()}`
  }, [from, to])

  const items = list.data?.items ?? []
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.limit)) : 1

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">
            Every recorded change in this school — who, what, when, and what was different.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={exportHref} download>
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </a>
        </Button>
      </div>

      <Card>
        <CardContent className="grid items-end gap-3 p-3 sm:grid-cols-[1fr_140px_140px_160px_160px]">
          <div className="space-y-1.5">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setPage(1)
                }}
                placeholder="Action, entity, record ID…"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Entity</Label>
            <Select
              value={entityType}
              onValueChange={(v) => {
                setEntityType(v)
                setPage(1)
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any</SelectItem>
                {(list.data?.facets.entityTypes ?? []).map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Action</Label>
            <Select
              value={action}
              onValueChange={(v) => {
                setAction(v)
                setPage(1)
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any</SelectItem>
                {(list.data?.facets.actions ?? []).map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {list.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <History className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No audit entries match these filters.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="hidden grid-cols-[160px_2fr_2fr_2fr_140px_60px] gap-2 border-b px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground sm:grid">
                <div>Timestamp</div>
                <div>User</div>
                <div>Action</div>
                <div>Entity</div>
                <div>IP</div>
                <div className="text-right">Changes</div>
              </div>
              <ul className="divide-y">
                {items.map((r) => (
                  <li
                    key={r.id}
                    className="grid items-center gap-2 p-3 text-sm sm:grid-cols-[160px_2fr_2fr_2fr_140px_60px]"
                  >
                    <div className="text-xs text-muted-foreground">
                      {dayjs(r.createdAt).format("D MMM YYYY · HH:mm:ss")}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.user?.name ?? "System"}</p>
                      {r.user?.role && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {r.user.role.replace(/_/g, " ").toLowerCase()}
                        </p>
                      )}
                    </div>
                    <div className="truncate">
                      <Badge variant="outline" className="text-[10px]">
                        {r.action}
                      </Badge>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.entityType}</p>
                      {r.entityId && (
                        <p className="truncate text-[11px] font-mono text-muted-foreground">
                          {r.entityId.slice(-12)}
                        </p>
                      )}
                    </div>
                    <div className="truncate text-[11px] font-mono text-muted-foreground">
                      {r.ipAddress ?? "—"}
                    </div>
                    <div className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewing(r)}
                        disabled={!r.payload}
                      >
                        View
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {list.data && list.data.total > list.data.limit && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {(page - 1) * list.data.limit + 1}–
                {Math.min(page * list.data.limit, list.data.total)} of{" "}
                {list.data.total.toLocaleString()}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ChangeDialog row={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

function ChangeDialog({ row, onClose }: { row: AuditRow | null; onClose: () => void }) {
  if (!row) return null
  const payload = row.payload as
    | { changes?: Record<string, { old: unknown; new: unknown }> }
    | null
    | undefined
  const changes = payload?.changes ?? null

  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {row.action} · {row.entityType}
            {row.entityId && (
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {row.entityId}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {dayjs(row.createdAt).format("D MMM YYYY · HH:mm:ss")}
          {row.user && ` · ${row.user.name} (${row.user.role.replace(/_/g, " ").toLowerCase()})`}
          {row.ipAddress && ` · IP ${row.ipAddress}`}
        </p>
        {changes ? (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Changes
            </p>
            <ul className="space-y-1.5">
              {Object.entries(changes).map(([field, c]) => (
                <li key={field} className="rounded-md border p-2 text-xs">
                  <div className="font-mono font-semibold">{field}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Before</p>
                      <pre className="overflow-x-auto rounded bg-red-50 p-1 text-[11px] text-red-900">
                        {JSON.stringify(c.old, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">After</p>
                      <pre className="overflow-x-auto rounded bg-emerald-50 p-1 text-[11px] text-emerald-900">
                        {JSON.stringify(c.new, null, 2)}
                      </pre>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <pre className="overflow-x-auto rounded-md border bg-muted/30 p-2 text-[11px]">
            {JSON.stringify(row.payload, null, 2)}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  )
}
