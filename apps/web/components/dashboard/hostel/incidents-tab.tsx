"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import { AlertTriangle, FilePlus, Loader2 } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type Hostel = { id: string; name: string }
type Incident = {
  id: string
  hostel: { id: string; name: string }
  student: { id: string; name: string; admissionNumber: string } | null
  reporter: string
  description: string
  actionTaken: string | null
  severity: "LOW" | "MEDIUM" | "HIGH"
  occurredAt: string
}

const SEVERITY_STYLE: Record<Incident["severity"], string> = {
  LOW: "bg-muted text-muted-foreground",
  MEDIUM: "bg-amber-100 text-amber-800",
  HIGH: "bg-red-100 text-red-800",
}

export function HostelIncidentsTab() {
  const qc = useQueryClient()
  const [composeOpen, setComposeOpen] = useState(false)

  const list = useQuery<{ items: Incident[] }>({
    queryKey: ["hostel-incidents"],
    queryFn: async () => {
      const res = await fetch("/api/hostel/incidents")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const items = list.data?.items ?? []

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setComposeOpen(true)}>
          <FilePlus className="mr-1.5 h-4 w-4" />
          Log incident
        </Button>
      </div>

      {list.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No incidents logged.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id}>
              <Card>
                <CardContent className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${SEVERITY_STYLE[i.severity]}`}>
                      {i.severity}
                    </Badge>
                    <span className="text-sm font-semibold">{i.hostel.name}</span>
                    {i.student && (
                      <span className="text-xs text-muted-foreground">
                        · {i.student.name} ({i.student.admissionNumber})
                      </span>
                    )}
                  </div>
                  <p className="text-sm">{i.description}</p>
                  {i.actionTaken && (
                    <p className="text-xs">
                      <span className="font-medium">Action taken:</span> {i.actionTaken}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {dayjs(i.occurredAt).format("D MMM YYYY · h:mm A")} · logged by {i.reporter}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {composeOpen && (
        <IncidentDialog
          onClose={() => setComposeOpen(false)}
          onSaved={() => {
            setComposeOpen(false)
            qc.invalidateQueries({ queryKey: ["hostel-incidents"] })
          }}
        />
      )}
    </div>
  )
}

function IncidentDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [hostelId, setHostelId] = useState("")
  const [description, setDescription] = useState("")
  const [actionTaken, setActionTaken] = useState("")
  const [severity, setSeverity] = useState<"LOW" | "MEDIUM" | "HIGH">("LOW")

  const hostels = useQuery<{ items: Hostel[] }>({
    queryKey: ["hostels"],
    queryFn: async () => {
      const res = await fetch("/api/hostel/hostels")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/hostel/incidents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hostelId,
          description: description.trim(),
          actionTaken: actionTaken.trim() || null,
          severity,
        }),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Failed")
    },
    onSuccess: () => {
      toast.success("Incident logged")
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log incident</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Hostel</Label>
            <Select value={hostelId} onValueChange={setHostelId}>
              <SelectTrigger><SelectValue placeholder="Pick a hostel" /></SelectTrigger>
              <SelectContent>
                {(hostels.data?.items ?? []).map((h) => (
                  <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Severity</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as "LOW" | "MEDIUM" | "HIGH")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened?"
              maxLength={2000}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Action taken (optional)</Label>
            <Input
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              placeholder="e.g. Spoke to student, called parent"
              maxLength={1000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!hostelId || description.trim().length < 2 || save.isPending}
          >
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Log
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
