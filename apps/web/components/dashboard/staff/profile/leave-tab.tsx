"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type Balance = {
  leaveType: string
  entitled: number
  used: number
  remaining: number
  paid: boolean
}
type BalanceResponse = { balances: Balance[] }

type HistoryItem = {
  id: string
  leaveType: string
  startDate: string
  endDate: string
  daysRequested: number
  reason: string
  status: string
  reviewerName: string | null
  substituteName: string | null
  reviewedAt: string | null
  reviewerComment: string | null
  createdAt: string
}
type HistoryResponse = { items: HistoryItem[] }

export function LeaveTab({ staffId, isSelf }: { staffId: string; isSelf: boolean }) {
  const balance = useQuery<BalanceResponse>({
    queryKey: ["staff-leave-balance", staffId],
    queryFn: async () => {
      const res = await fetch(`/api/staff/${staffId}/leave-balance`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })
  const history = useQuery<HistoryResponse>({
    queryKey: ["staff-leave-history", staffId],
    queryFn: async () => {
      const res = await fetch(`/api/staff/${staffId}/leave`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Leave balance (this year)</CardTitle>
          {isSelf && (
            <Button size="sm" asChild>
              <Link href="/dashboard/staff/leave">Apply for leave</Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {balance.isLoading || !balance.data ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading balance…
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {balance.data.balances.map((b) => (
                <div key={b.leaveType} className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{b.leaveType[0] + b.leaveType.slice(1).toLowerCase()}</span>
                    {!b.paid && (
                      <Badge variant="outline" className="text-[10px]">
                        Unpaid
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">{b.used}/{b.entitled} used</span>
                    <span
                      className={cn(
                        "text-base font-bold tabular-nums",
                        b.remaining > 0 ? "text-emerald-600" : "text-red-600",
                      )}
                    >
                      {b.remaining}d
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-background">
                    <div
                      className={cn(
                        "h-full",
                        b.remaining === 0
                          ? "bg-red-500"
                          : b.remaining / Math.max(1, b.entitled) > 0.4
                            ? "bg-emerald-500"
                            : "bg-amber-500",
                      )}
                      style={{ width: `${b.entitled === 0 ? 0 : Math.min(100, (b.used / b.entitled) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leave history</CardTitle>
        </CardHeader>
        <CardContent>
          {history.isLoading || !history.data ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : history.data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leave requests yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead>Substitute</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-xs">{i.leaveType[0] + i.leaveType.slice(1).toLowerCase()}</TableCell>
                    <TableCell className="text-xs">
                      {dayjs(i.startDate).format("D MMM")}{" – "}
                      {dayjs(i.endDate).format("D MMM YYYY")}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">{i.daysRequested}</TableCell>
                    <TableCell>
                      <StatusBadge status={i.status} />
                    </TableCell>
                    <TableCell className="text-xs">{i.reviewerName ?? "—"}</TableCell>
                    <TableCell className="text-xs">{i.substituteName ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    PENDING: "secondary",
    APPROVED: "default",
    REJECTED: "destructive",
    CANCELLED: "outline",
  }
  return (
    <Badge variant={map[status] ?? "outline"} className="text-[10px]">
      {status[0] + status.slice(1).toLowerCase()}
    </Badge>
  )
}
