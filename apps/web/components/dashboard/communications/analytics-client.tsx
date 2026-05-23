"use client"

import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import { AlertTriangle, BarChart3, Loader2, PhoneOff, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type Response = {
  sms: {
    counts: { QUEUED: number; SENT: number; DELIVERED: number; FAILED: number }
    total: number
    successRate: number | null
    batches: number
    recentBatches: {
      id: string
      audience: string
      total: number
      delivered: number
      failed: number
      status: string
      createdAt: string
    }[]
  }
  mostEngaged: { userId: string; name: string; role: string; email: string; readCount: number }[]
  uncontactable: {
    phone: string
    failureCount: number
    userId: string | null
    name: string | null
    role: string | null
  }[]
  parents: { total: number; uncontactable: number }
}

export function CommunicationAnalyticsClient() {
  const data = useQuery<Response>({
    queryKey: ["comms-analytics"],
    queryFn: async () => {
      const res = await fetch("/api/communications/analytics")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  if (data.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics…
      </div>
    )
  }

  if (!data.data) {
    return <p className="text-sm italic text-muted-foreground">No data.</p>
  }

  const d = data.data
  const counts = d.sms.counts

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          <BarChart3 className="mr-1.5 inline h-5 w-5 text-primary" />
          Communication analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          SMS delivery, engagement, and uncontactable parents to follow up on.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="SMS sent" value={d.sms.total.toLocaleString()} />
        <Tile
          label="Success rate"
          value={d.sms.successRate === null ? "—" : `${d.sms.successRate}%`}
          tone={d.sms.successRate !== null && d.sms.successRate < 80 ? "danger" : "ok"}
        />
        <Tile label="Failed" value={counts.FAILED.toLocaleString()} tone="danger" />
        <Tile
          label="Uncontactable parents"
          value={`${d.parents.uncontactable} / ${d.parents.total}`}
          tone={d.parents.uncontactable > 0 ? "warn" : "ok"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              <TrendingUp className="mr-1.5 inline h-4 w-4 text-emerald-600" />
              Most engaged readers
            </CardTitle>
            <CardDescription>By announcement read receipts.</CardDescription>
          </CardHeader>
          <CardContent>
            {d.mostEngaged.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">No reads tracked yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Reads</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.mostEngaged.slice(0, 10).map((u) => (
                    <TableRow key={u.userId}>
                      <TableCell>
                        <span className="block text-sm">{u.name}</span>
                        <span className="block text-[10px] text-muted-foreground">{u.email}</span>
                      </TableCell>
                      <TableCell className="text-xs">{u.role.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        {u.readCount}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              <PhoneOff className="mr-1.5 inline h-4 w-4 text-red-600" />
              Uncontactable numbers
            </CardTitle>
            <CardDescription>
              3+ SMS failures and never delivered. Flag for admin follow-up.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {d.uncontactable.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">All numbers reachable.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone</TableHead>
                    <TableHead>Linked user</TableHead>
                    <TableHead className="text-right">Failures</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.uncontactable.map((u) => (
                    <TableRow key={u.phone}>
                      <TableCell className="font-mono text-xs">{u.phone}</TableCell>
                      <TableCell className="text-xs">
                        {u.name ? (
                          <>
                            {u.name}
                            {u.role && (
                              <span className="ml-1 text-muted-foreground">
                                · {u.role.replace(/_/g, " ")}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold text-red-700">
                        {u.failureCount}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent SMS batches</CardTitle>
        </CardHeader>
        <CardContent>
          {d.sms.recentBatches.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">No batches yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.sms.recentBatches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-xs">
                      {dayjs(b.createdAt).format("D MMM HH:mm")}
                    </TableCell>
                    <TableCell className="text-xs">{b.audience}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{b.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">{b.total}</TableCell>
                    <TableCell className="text-right text-xs text-emerald-700">
                      {b.delivered}
                    </TableCell>
                    <TableCell className="text-right text-xs text-red-700">{b.failed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs italic text-muted-foreground">
        <AlertTriangle className="mr-1 inline h-3 w-3" />
        WhatsApp open rates require Meta delivery webhooks — not yet wired up. Show counts only for now.
      </p>
    </div>
  )
}

function Tile({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: "ok" | "warn" | "danger" | "neutral"
}) {
  const toneClass = {
    ok: "text-emerald-700",
    warn: "text-amber-700",
    danger: "text-red-700",
    neutral: "text-foreground",
  }[tone]
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-bold tabular-nums", toneClass)}>{value}</p>
      </CardContent>
    </Card>
  )
}
