"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import { AlertTriangle, Loader2, Send, Siren } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

type AlertType = "SCHOOL_CLOSURE" | "SECURITY_INCIDENT" | "HEALTH_ALERT" | "OTHER"

type ChannelCounts = {
  sms?: number
  smsDelivered?: number
  whatsapp?: number
  push?: number
  email?: number
  inApp?: number
}

type HistoryItem = {
  id: string
  alertType: AlertType
  title: string
  message: string
  recipientCount: number
  channelCounts: ChannelCounts
  sender: string | null
  sentAt: string
}

type AlertResponse = {
  items: HistoryItem[]
  reach: { parents: number; staff: number; sms: number; email: number }
}

const ALERT_LABEL: Record<AlertType, string> = {
  SCHOOL_CLOSURE: "School closure",
  SECURITY_INCIDENT: "Security incident",
  HEALTH_ALERT: "Health alert",
  OTHER: "Other",
}

export function EmergencyAlertClient() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [confirmStep, setConfirmStep] = useState<1 | 2>(1)
  const [alertType, setAlertType] = useState<AlertType>("OTHER")
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")

  const data = useQuery<AlertResponse>({
    queryKey: ["emergency-alerts"],
    queryFn: async () => {
      const res = await fetch("/api/communications/emergency")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const send = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/communications/emergency", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alertType, title, message, confirm: true }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? "Failed")
      return body as { recipientCount: number; channelCounts: ChannelCounts }
    },
    onSuccess: (d) => {
      toast.success(`Alert sent to ${d.recipientCount} recipients`)
      setOpen(false)
      setConfirmStep(1)
      setTitle("")
      setMessage("")
      qc.invalidateQueries({ queryKey: ["emergency-alerts"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  function startConfirm() {
    if (!title.trim() || !message.trim()) {
      toast.error("Title and message required")
      return
    }
    setConfirmStep(2)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          <Siren className="mr-1.5 inline h-5 w-5 text-red-600" />
          Emergency alerts
        </h1>
        <p className="text-sm text-muted-foreground">
          Fan out via SMS, WhatsApp, push, email and in-app simultaneously.
          Use sparingly — recipients can&apos;t opt out.
        </p>
      </div>

      <Card className="border-red-500/30 bg-red-50/50">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-red-600" />
          <p className="text-sm font-medium">Critical broadcast to everyone</p>
          <p className="max-w-md text-xs text-muted-foreground">
            Reaches{" "}
            <strong>{(data.data?.reach.parents ?? 0) + (data.data?.reach.staff ?? 0)}</strong>{" "}
            people across SMS ({data.data?.reach.sms ?? 0}) and email (
            {data.data?.reach.email ?? 0}).
          </p>
          <Button
            size="lg"
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={() => {
              setConfirmStep(1)
              setOpen(true)
            }}
          >
            <Siren className="mr-2 h-5 w-5" />
            Send emergency alert
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent alerts</CardTitle>
          <CardDescription>Last 10 alerts sent. Cannot be deleted.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : !data.data?.items.length ? (
            <p className="text-sm italic text-muted-foreground">No alerts sent yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="text-right">Recipients</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Sender</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">
                      {dayjs(a.sentAt).format("D MMM HH:mm")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive" className="text-[10px]">
                        {ALERT_LABEL[a.alertType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs" title={a.message}>
                      {a.title}
                    </TableCell>
                    <TableCell className="text-right text-xs">{a.recipientCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      SMS {a.channelCounts.sms ?? 0} · WA {a.channelCounts.whatsapp ?? 0} ·
                      Push {a.channelCounts.push ?? 0} · Email {a.channelCounts.email ?? 0}
                    </TableCell>
                    <TableCell className="text-xs">{a.sender ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) {
            setOpen(false)
            setConfirmStep(1)
          }
        }}
      >
        <DialogContent className="max-w-md">
          {confirmStep === 1 ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-red-700">
                  <Siren className="mr-1 inline h-4 w-4" /> Compose emergency alert
                </DialogTitle>
                <DialogDescription>
                  Step 1 of 2. Recipients cannot opt out.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={alertType} onValueChange={(v) => setAlertType(v as AlertType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SCHOOL_CLOSURE">School closure</SelectItem>
                      <SelectItem value="SECURITY_INCIDENT">Security incident</SelectItem>
                      <SelectItem value="HEALTH_ALERT">Health alert</SelectItem>
                      <SelectItem value="OTHER">Other urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
                </div>
                <div>
                  <Label className="text-xs">Message</Label>
                  <Textarea
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={640}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {message.length}/640 chars
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button className="bg-red-600 hover:bg-red-700" onClick={startConfirm}>
                  Review
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-red-700">Confirm broadcast</DialogTitle>
                <DialogDescription>
                  Step 2 of 2. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs">{message}</p>
                </div>
                <p className="text-xs">
                  Will reach approximately{" "}
                  <strong>
                    {(data.data?.reach.parents ?? 0) + (data.data?.reach.staff ?? 0)}
                  </strong>{" "}
                  people via SMS ({data.data?.reach.sms ?? 0}), WhatsApp, push, email (
                  {data.data?.reach.email ?? 0}), and in-app.
                </p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirmStep(1)} disabled={send.isPending}>
                  Back
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700"
                  disabled={send.isPending}
                  onClick={() => send.mutate()}
                >
                  {send.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 h-4 w-4" />
                  )}
                  Send now
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
