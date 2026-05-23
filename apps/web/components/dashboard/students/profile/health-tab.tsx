"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Plus, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { StudentDTO } from "@/components/dashboard/students/profile/types"

type HealthEntry = { id: string; date: string; description: string; actionTaken: string | null }

export function HealthTab({ student, canWrite }: { student: StudentDTO; canWrite: boolean }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"))
  const [description, setDescription] = useState("")
  const [actionTaken, setActionTaken] = useState("")

  const { data, isLoading } = useQuery<{ items: HealthEntry[] }>({
    queryKey: ["health", student.id],
    queryFn: async () => {
      const res = await fetch(`/api/students/${student.id}/health-entries`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/students/${student.id}/health-entries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, description, actionTaken: actionTaken || undefined }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? "Couldn't save entry")
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success("Medical entry added")
      qc.invalidateQueries({ queryKey: ["health", student.id] })
      setOpen(false)
      setDescription("")
      setActionTaken("")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Health profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Field k="Blood group" v={student.bloodGroup ?? "—"} />
          <Field k="Genotype" v={student.genotype ?? "—"} />
          <Field k="Allergies" v={student.knownAllergies ?? "—"} full />
          <Field k="Disabilities" v={student.disabilities ?? "—"} full />
          <Field k="Special needs" v={student.specialNeeds ?? "—"} full />
          <Field k="Family doctor" v={student.doctorName ?? "—"} />
          <Field k="Doctor phone" v={student.doctorPhone ?? "—"} />
          <Field k="Insurance" v={student.medicalInsurance ?? "—"} full />
          <Field
            k="Emergency consent"
            v={student.emergencyMedicalConsent ? "Granted" : "Not granted"}
            full
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Medical history</CardTitle>
          {canWrite && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Add entry
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !data || data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No medical history recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.items.map((e) => (
                <li key={e.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{dayjs(e.date).format("D MMM YYYY")}</span>
                  </div>
                  <p className="mt-1 text-sm">{e.description}</p>
                  {e.actionTaken && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Action: {e.actionTaken}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add medical entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="he-date">Date</Label>
              <Input id="he-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="he-desc">Description</Label>
              <Textarea
                id="he-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Symptoms, diagnosis…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="he-act">Action taken (optional)</Label>
              <Textarea
                id="he-act"
                rows={2}
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
                placeholder="Treatment, referral, medication…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => add.mutate()}
              disabled={description.trim().length < 2 || add.isPending}
            >
              {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ k, v, full }: { k: string; v: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="text-sm font-medium">{v}</div>
    </div>
  )
}
