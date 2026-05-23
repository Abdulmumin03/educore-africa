"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Check, Loader2, LogIn, LogOut, Plane, X } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export type Exeat = {
  id: string
  studentId: string
  student: { firstName: string; lastName: string; admissionNumber: string }
  departureDate: string
  returnDate: string
  destination: string
  reason: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "PICKED_UP" | "RETURNED"
  approvedBy: { id: string; name: string } | null
  approvedAt: string | null
  rejectionReason: string | null
  pickupOtp: string | null
  pickupConfirmedAt: string | null
  returnConfirmedAt: string | null
  createdAt: string
}

const STATUS_VARIANT: Record<
  Exeat["status"],
  { label: string; cls: string }
> = {
  PENDING: { label: "Pending", cls: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "Approved", cls: "bg-blue-100 text-blue-800" },
  REJECTED: { label: "Rejected", cls: "bg-red-100 text-red-800" },
  PICKED_UP: { label: "Picked up", cls: "bg-purple-100 text-purple-800" },
  RETURNED: { label: "Returned", cls: "bg-emerald-100 text-emerald-800" },
}

export function HostelExeatTab({ isStaff }: { isStaff: boolean }) {
  const qc = useQueryClient()
  const [rejecting, setRejecting] = useState<Exeat | null>(null)
  const [pickupFor, setPickupFor] = useState<Exeat | null>(null)

  const list = useQuery<{ items: Exeat[] }>({
    queryKey: ["exeats"],
    queryFn: async () => {
      const res = await fetch("/api/hostel/exeat")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const act = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/hostel/exeat/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Failed")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exeats"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const items = list.data?.items ?? []

  return (
    <div className="space-y-4">
      {list.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <Plane className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No exeat requests yet.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((e) => (
            <li key={e.id}>
              <Card>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold">
                          {e.student.firstName} {e.student.lastName}
                        </h3>
                        <Badge className={`text-[10px] ${STATUS_VARIANT[e.status].cls}`} variant="outline">
                          {STATUS_VARIANT[e.status].label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {e.student.admissionNumber}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {dayjs(e.departureDate).format("D MMM YYYY HH:mm")} → {dayjs(e.returnDate).format("D MMM YYYY HH:mm")} · {e.destination}
                      </p>
                      <p className="mt-1 text-sm">{e.reason}</p>
                      {e.rejectionReason && (
                        <p className="mt-1 rounded border bg-red-50 px-2 py-1 text-xs text-red-900">
                          Reason for rejection: {e.rejectionReason}
                        </p>
                      )}
                      {e.status === "APPROVED" && e.pickupOtp && (
                        <p className="mt-1 inline-block rounded border bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
                          Pickup OTP: <span className="font-mono font-bold tracking-wider">{e.pickupOtp}</span>
                        </p>
                      )}
                    </div>
                    {isStaff && (
                      <div className="flex flex-wrap gap-1">
                        {e.status === "PENDING" && (
                          <>
                            <Button
                              size="sm"
                              disabled={act.isPending}
                              onClick={() => act.mutate({ id: e.id, body: { action: "approve" } })}
                            >
                              <Check className="mr-1.5 h-4 w-4" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setRejecting(e)}
                            >
                              <X className="mr-1.5 h-4 w-4" />
                              Reject
                            </Button>
                          </>
                        )}
                        {e.status === "APPROVED" && (
                          <Button size="sm" onClick={() => setPickupFor(e)}>
                            <LogOut className="mr-1.5 h-4 w-4" />
                            Confirm pickup
                          </Button>
                        )}
                        {e.status === "PICKED_UP" && (
                          <Button
                            size="sm"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ id: e.id, body: { action: "return" } })}
                          >
                            <LogIn className="mr-1.5 h-4 w-4" />
                            Confirm return
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Requested {dayjs(e.createdAt).format("D MMM YYYY · h:mm A")}
                    {e.approvedAt && ` · acted ${dayjs(e.approvedAt).format("D MMM YYYY · h:mm A")}${e.approvedBy ? ` by ${e.approvedBy.name}` : ""}`}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {rejecting && (
        <RejectDialog
          exeat={rejecting}
          onClose={() => setRejecting(null)}
          onConfirm={(reason) => {
            act.mutate(
              { id: rejecting.id, body: { action: "reject", reason } },
              { onSuccess: () => setRejecting(null) },
            )
          }}
          busy={act.isPending}
        />
      )}
      {pickupFor && (
        <PickupDialog
          exeat={pickupFor}
          onClose={() => setPickupFor(null)}
          onConfirm={(otp) => {
            act.mutate(
              { id: pickupFor.id, body: { action: "pickup", otp } },
              { onSuccess: () => setPickupFor(null) },
            )
          }}
          busy={act.isPending}
        />
      )}
    </div>
  )
}

function RejectDialog({
  exeat,
  onClose,
  onConfirm,
  busy,
}: {
  exeat: Exeat
  onClose: () => void
  onConfirm: (reason: string) => void
  busy: boolean
}) {
  const [reason, setReason] = useState("")
  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject exeat for {exeat.student.firstName}?</DialogTitle>
        </DialogHeader>
        <Label className="text-xs">Reason (sent to parent via SMS)</Label>
        <Textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Mid-term exams ongoing"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length < 2 || busy}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PickupDialog({
  exeat,
  onClose,
  onConfirm,
  busy,
}: {
  exeat: Exeat
  onClose: () => void
  onConfirm: (otp: string) => void
  busy: boolean
}) {
  const [otp, setOtp] = useState("")
  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm pickup</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Ask the parent for the 6-digit OTP sent in the approval SMS, then enter it
          below to confirm {exeat.student.firstName} {exeat.student.lastName} is leaving.
        </p>
        <Label className="text-xs">Pickup OTP</Label>
        <Input
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="6-digit code"
          inputMode="numeric"
          maxLength={6}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={otp.length !== 6 || busy}
            onClick={() => onConfirm(otp)}
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Confirm pickup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
