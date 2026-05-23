"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import { CheckCircle2, Loader2, MessageSquare, Send, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type AudienceType = "ALL_PARENTS" | "ALL_STAFF" | "CLASS_PARENTS" | "CUSTOM"

type BatchRow = {
  id: string
  audienceLabel: string
  message: string
  status: "DRAFT" | "SCHEDULED" | "SENDING" | "COMPLETED" | "FAILED"
  scheduledAt: string | null
  sentAt: string | null
  totalCount: number
  deliveredCount: number
  failedCount: number
  sender: string | null
  createdAt: string
}

function segmentCount(len: number) {
  if (len === 0) return 0
  if (len <= 160) return 1
  return Math.ceil(len / 153)
}

export function SmsComposerClient({
  classes,
  providerConfigured,
}: {
  classes: { id: string; name: string }[]
  providerConfigured: boolean
}) {
  const qc = useQueryClient()
  const [audienceType, setAudienceType] = useState<AudienceType>("ALL_PARENTS")
  const [classId, setClassId] = useState<string>("")
  const [customPhones, setCustomPhones] = useState("")
  const [message, setMessage] = useState("")
  const [scheduledAt, setScheduledAt] = useState("")

  const charCount = message.length
  const segments = segmentCount(charCount)
  const tooLong = charCount > 640

  const batches = useQuery<{ items: BatchRow[] }>({
    queryKey: ["sms-batches"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/sms")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    refetchInterval: 8000,
  })

  const send = useMutation({
    mutationFn: async () => {
      const audience =
        audienceType === "ALL_PARENTS"
          ? { type: "ALL_PARENTS" as const }
          : audienceType === "ALL_STAFF"
            ? { type: "ALL_STAFF" as const }
            : audienceType === "CLASS_PARENTS"
              ? { type: "CLASS_PARENTS" as const, classId }
              : {
                  type: "CUSTOM" as const,
                  phones: customPhones
                    .split(/[\n,]/)
                    .map((p) => p.trim())
                    .filter(Boolean),
                }
      const res = await fetch("/api/notifications/sms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          audience,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? "Failed to send")
      return body as {
        ok: boolean
        totalCount: number
        deliveredCount: number
        failedCount: number
        scheduled: boolean
      }
    },
    onSuccess: (d) => {
      if (d.scheduled) {
        toast.success(`Scheduled SMS to ${d.totalCount} recipient${d.totalCount === 1 ? "" : "s"}`)
      } else {
        toast.success(`Sent: ${d.deliveredCount} delivered, ${d.failedCount} failed`)
      }
      setMessage("")
      setScheduledAt("")
      qc.invalidateQueries({ queryKey: ["sms-batches"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const audienceLabel = useMemo(() => {
    switch (audienceType) {
      case "ALL_PARENTS":
        return "All parents"
      case "ALL_STAFF":
        return "All staff"
      case "CLASS_PARENTS":
        return `Parents of ${classes.find((c) => c.id === classId)?.name ?? "—"}`
      case "CUSTOM":
        return `${customPhones.split(/[\n,]/).filter((p) => p.trim()).length} custom numbers`
    }
  }, [audienceType, classId, customPhones, classes])

  const canSend =
    message.trim().length > 0 &&
    !tooLong &&
    (audienceType !== "CLASS_PARENTS" || !!classId) &&
    (audienceType !== "CUSTOM" || customPhones.trim().length > 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          <MessageSquare className="mr-1.5 inline h-5 w-5 text-primary" />
          Bulk SMS
        </h1>
        <p className="text-sm text-muted-foreground">
          Send text messages to parents or staff via Africa&apos;s Talking.
          {!providerConfigured && (
            <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-700">
              Provider not configured — messages will fail until AFRICASTALKING_API_KEY is set.
            </span>
          )}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Compose</CardTitle>
            <CardDescription>{audienceLabel}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Audience</Label>
                <Select value={audienceType} onValueChange={(v) => setAudienceType(v as AudienceType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_PARENTS">All parents</SelectItem>
                    <SelectItem value="ALL_STAFF">All staff</SelectItem>
                    <SelectItem value="CLASS_PARENTS">Parents of a class</SelectItem>
                    <SelectItem value="CUSTOM">Custom number list</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {audienceType === "CLASS_PARENTS" && (
                <div>
                  <Label className="text-xs">Class</Label>
                  <Select value={classId} onValueChange={setClassId}>
                    <SelectTrigger><SelectValue placeholder="Pick a class" /></SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {audienceType === "CUSTOM" && (
                <div className="sm:col-span-2">
                  <Label className="text-xs">Phone numbers (one per line or comma-separated)</Label>
                  <Textarea
                    rows={3}
                    placeholder="+2348012345678&#10;+2347012345678"
                    value={customPhones}
                    onChange={(e) => setCustomPhones(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs">Message</Label>
              <Textarea
                rows={5}
                placeholder="Hi parent, your child's PTA meeting is on Saturday at 10am."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>
                  {charCount} chars · {segments} SMS segment{segments === 1 ? "" : "s"}
                </span>
                {tooLong && <span className="text-red-600">Max 640 chars (4 segments)</span>}
              </div>
            </div>

            <div>
              <Label className="text-xs">Schedule for later (optional)</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>

            <Button disabled={!canSend || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              {scheduledAt ? "Schedule SMS" : "Send now"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>How recipients will see it.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-semibold">School SMS</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {message || <em>(empty)</em>}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent batches</CardTitle>
          <CardDescription>Delivery report. Refreshes every 8s.</CardDescription>
        </CardHeader>
        <CardContent>
          {batches.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : !batches.data?.items.length ? (
            <p className="text-sm italic text-muted-foreground">No batches yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.data.items.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-xs">
                      {dayjs(b.sentAt ?? b.createdAt).format("D MMM HH:mm")}
                    </TableCell>
                    <TableCell className="text-xs">{b.audienceLabel}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs" title={b.message}>
                      {b.message}
                    </TableCell>
                    <TableCell className="text-right text-xs">{b.totalCount}</TableCell>
                    <TableCell className="text-right text-xs text-emerald-700">
                      {b.deliveredCount}
                    </TableCell>
                    <TableCell className="text-right text-xs text-red-700">
                      {b.failedCount}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={b.status} />
                    </TableCell>
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

function StatusBadge({ status }: { status: BatchRow["status"] }) {
  const map = {
    DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
    SCHEDULED: { label: "Scheduled", className: "bg-amber-100 text-amber-800" },
    SENDING: { label: "Sending…", className: "bg-blue-100 text-blue-800" },
    COMPLETED: { label: "Completed", className: "bg-emerald-100 text-emerald-800" },
    FAILED: { label: "Failed", className: "bg-red-100 text-red-800" },
  } as const
  const v = map[status]
  const Icon = status === "COMPLETED" ? CheckCircle2 : status === "FAILED" ? XCircle : null
  return (
    <Badge variant="outline" className={cn("text-[10px]", v.className)}>
      {Icon ? <Icon className="mr-1 h-3 w-3" /> : null}
      {v.label}
    </Badge>
  )
}
