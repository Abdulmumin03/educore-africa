"use client"

import { useState } from "react"
import dayjs from "dayjs"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Loader2, Paperclip, ShieldAlert, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { Textarea } from "@/components/ui/textarea"

type StaffOpt = {
  id: string
  staffNumber: string
  firstName: string
  lastName: string
  department: string | null
}

type LeaveItem = {
  id: string
  leaveType: string
  startDate: string
  endDate: string
  daysRequested: number
  reason: string
  attachmentUrl: string | null
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
  createdAt: string
  reviewedAt: string | null
  reviewerName: string | null
  reviewerComment: string | null
  substituteName: string | null
  staff: {
    id: string
    staffNumber: string
    firstName: string
    lastName: string
    avatarUrl: string | null
    department: string | null
  }
}

const LEAVE_TYPES = [
  "ANNUAL",
  "SICK",
  "MATERNITY",
  "PATERNITY",
  "EMERGENCY",
  "STUDY",
  "UNPAID",
] as const

export function LeaveManagement({
  isApprover,
  myStaffId,
  myStaffName,
  staff,
}: {
  isApprover: boolean
  myStaffId: string | null
  myStaffName: string | null
  staff: StaffOpt[]
}) {
  const qc = useQueryClient()

  const all = useQuery<{ items: LeaveItem[] }>({
    queryKey: ["leave-queue"],
    queryFn: async () => {
      const res = await fetch("/api/staff/leave")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const pending = (all.data?.items ?? []).filter((i) => i.status === "PENDING")
  const reviewed = (all.data?.items ?? []).filter((i) => i.status !== "PENDING")

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leave</h1>
        <p className="text-sm text-muted-foreground">
          {isApprover
            ? "Review pending requests and apply on behalf of staff."
            : "Apply for leave and track your requests."}
        </p>
      </div>

      {myStaffId ? (
        <ApplyCard staffId={myStaffId} staffName={myStaffName ?? "you"} onApplied={() => all.refetch()} />
      ) : (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Your account isn&apos;t linked to a staff profile, so you can&apos;t apply for leave yourself.
          </CardContent>
        </Card>
      )}

      {isApprover && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <ShieldAlert className="mr-1.5 inline h-4 w-4 text-amber-600" />
              Pending approvals ({pending.length})
            </CardTitle>
            <CardDescription>Tap a request to approve or reject.</CardDescription>
          </CardHeader>
          <CardContent>
            {all.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending requests right now.</p>
            ) : (
              <ul className="space-y-2">
                {pending.map((p) => (
                  <PendingRow
                    key={p.id}
                    item={p}
                    staff={staff}
                    onChanged={() => qc.invalidateQueries({ queryKey: ["leave-queue"] })}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isApprover ? "All requests" : "My requests"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {all.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : reviewed.length === 0 && pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leave history yet.</p>
          ) : (
            <ul className="space-y-2">
              {[...pending, ...reviewed].map((i) => (
                <li key={i.id} className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {i.staff.firstName} {i.staff.lastName}{" "}
                        <span className="text-xs text-muted-foreground">· {i.staff.staffNumber}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {i.leaveType[0] + i.leaveType.slice(1).toLowerCase()} ·{" "}
                        {dayjs(i.startDate).format("D MMM")} – {dayjs(i.endDate).format("D MMM YYYY")} ·{" "}
                        {i.daysRequested} day(s)
                      </p>
                    </div>
                    <StatusBadge status={i.status} />
                  </div>
                  {i.reason && <p className="mt-1 text-xs">{i.reason}</p>}
                  {(i.reviewerComment || i.substituteName) && (
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {i.reviewerComment && <span>“{i.reviewerComment}”</span>}
                      {i.substituteName && <span>Substitute: {i.substituteName}</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ApplyCard({
  staffId,
  staffName,
  onApplied,
}: {
  staffId: string
  staffName: string
  onApplied: () => void
}) {
  const [leaveType, setLeaveType] = useState<(typeof LEAVE_TYPES)[number]>("ANNUAL")
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState("")
  const [attachmentUrl, setAttachmentUrl] = useState("")

  const apply = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/staff/${staffId}/leave`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leaveType, startDate, endDate, reason, attachmentUrl }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success("Leave request submitted")
      setReason("")
      setAttachmentUrl("")
      onApplied()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Apply for leave</CardTitle>
        <CardDescription>Submitting on behalf of {staffName}.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type">
            <Select value={leaveType} onValueChange={(v) => setLeaveType(v as (typeof LEAVE_TYPES)[number])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Start date">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End date">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label="Reason">
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Brief explanation for the request"
            />
          </Field>
          <Field label="Attachment URL (optional)">
            <Input
              value={attachmentUrl}
              onChange={(e) => setAttachmentUrl(e.target.value)}
              placeholder="Doctor's note, etc."
            />
            <p className="text-[10px] text-muted-foreground">
              <Paperclip className="mr-1 inline h-3 w-3" />
              Paste a link to a file you&apos;ve uploaded elsewhere.
            </p>
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            onClick={() => apply.mutate()}
            disabled={apply.isPending || reason.trim().length < 2}
          >
            {apply.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit request
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PendingRow({
  item,
  staff,
  onChanged,
}: {
  item: LeaveItem
  staff: StaffOpt[]
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <li className="rounded-md border bg-background p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">
              {item.staff.firstName[0]}
              {item.staff.lastName[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">
              {item.staff.firstName} {item.staff.lastName}{" "}
              <span className="text-xs text-muted-foreground">· {item.staff.staffNumber}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {item.leaveType[0] + item.leaveType.slice(1).toLowerCase()} ·{" "}
              {dayjs(item.startDate).format("D MMM")} – {dayjs(item.endDate).format("D MMM YYYY")} ·{" "}
              {item.daysRequested} day(s)
            </p>
            <p className="mt-1 text-xs">{item.reason}</p>
            {item.attachmentUrl && (
              <a
                href={item.attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                <Paperclip className="inline h-3 w-3" /> attachment
              </a>
            )}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Review
        </Button>
      </div>

      {open && (
        <ReviewDialog item={item} staff={staff} onClose={() => setOpen(false)} onChanged={onChanged} />
      )}
    </li>
  )
}

function ReviewDialog({
  item,
  staff,
  onClose,
  onChanged,
}: {
  item: LeaveItem
  staff: StaffOpt[]
  onClose: () => void
  onChanged: () => void
}) {
  const [comment, setComment] = useState("")
  const [substituteStaffId, setSubstituteStaffId] = useState<string>("")

  const review = useMutation({
    mutationFn: async (action: "APPROVE" | "REJECT") => {
      const res = await fetch(`/api/staff/leave/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          reviewerComment: comment,
          substituteStaffId: action === "APPROVE" ? substituteStaffId : "",
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ status: string }>
    },
    onSuccess: (d) => {
      toast.success(`Marked as ${d.status.toLowerCase()}`)
      onChanged()
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review leave request</DialogTitle>
          <DialogDescription>
            {item.staff.firstName} {item.staff.lastName} · {item.leaveType.toLowerCase()} ·{" "}
            {item.daysRequested} day(s)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">{item.reason}</div>
          <Field label="Substitute (optional)">
            <Select
              value={substituteStaffId || "__none__"}
              onValueChange={(v) => setSubstituteStaffId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                    {s.department ? ` · ${s.department}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Comment">
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose} disabled={review.isPending}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => review.mutate("REJECT")}
            disabled={review.isPending}
          >
            <XCircle className="mr-1.5 h-4 w-4 text-red-600" />
            Reject
          </Button>
          <Button onClick={() => review.mutate("APPROVE")} disabled={review.isPending}>
            {review.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
