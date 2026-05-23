"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type BehaviorLog = {
  id: string
  date: string
  severity: "MINOR" | "MODERATE" | "SEVERE"
  title: string
  description: string
  actionTaken: string | null
  counselorNotes: string | null
}

const SEVERITY_VARIANT: Record<BehaviorLog["severity"], "secondary" | "default" | "destructive"> = {
  MINOR: "secondary",
  MODERATE: "default",
  SEVERE: "destructive",
}

export function BehaviorTab({ studentId, canWrite }: { studentId: string; canWrite: boolean }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"))
  const [severity, setSeverity] = useState<BehaviorLog["severity"]>("MINOR")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [actionTaken, setActionTaken] = useState("")
  const [counselorNotes, setCounselorNotes] = useState("")

  const { data, isLoading } = useQuery<{ items: BehaviorLog[] }>({
    queryKey: ["behavior", studentId],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}/behavior-logs`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/students/${studentId}/behavior-logs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date,
          severity,
          title,
          description,
          actionTaken: actionTaken || undefined,
          counselorNotes: counselorNotes || undefined,
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? "Couldn't log incident")
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success("Incident logged")
      qc.invalidateQueries({ queryKey: ["behavior", studentId] })
      setOpen(false)
      setTitle("")
      setDescription("")
      setActionTaken("")
      setCounselorNotes("")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Behavior log</CardTitle>
          <p className="text-xs text-muted-foreground">
            Incidents and counselor follow-up notes.
          </p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Log incident
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data || data.items.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
            <p className="text-sm font-medium">No incidents logged</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Good news — nothing on record.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {data.items.map((l) => (
              <li key={l.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{l.title}</span>
                      <Badge variant={SEVERITY_VARIANT[l.severity]}>{l.severity}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {dayjs(l.date).format("D MMM YYYY")}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-sm">{l.description}</p>
                {l.actionTaken && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-semibold">Action:</span> {l.actionTaken}
                  </p>
                )}
                {l.counselorNotes && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-semibold">Counselor:</span> {l.counselorNotes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log incident</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bl-date">Date</Label>
                <Input id="bl-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={severity} onValueChange={(v) => setSeverity(v as BehaviorLog["severity"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MINOR">Minor</SelectItem>
                    <SelectItem value="MODERATE">Moderate</SelectItem>
                    <SelectItem value="SEVERE">Severe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bl-title">Title</Label>
              <Input id="bl-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bl-desc">Description</Label>
              <Textarea id="bl-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bl-act">Action taken (optional)</Label>
              <Textarea id="bl-act" rows={2} value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bl-cn">Counselor notes (optional)</Label>
              <Textarea id="bl-cn" rows={2} value={counselorNotes} onChange={(e) => setCounselorNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => add.mutate()}
              disabled={title.trim().length < 2 || description.trim().length < 2 || add.isPending}
            >
              {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
