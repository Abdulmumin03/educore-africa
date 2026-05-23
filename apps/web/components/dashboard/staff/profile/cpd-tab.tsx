"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import { ExternalLink, GraduationCap, Loader2, Plus, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

type Item = {
  id: string
  title: string
  provider: string | null
  type: string
  startDate: string
  endDate: string | null
  certificateUrl: string | null
  notes: string | null
}

type Suggestion = { title: string; rationale: string }
type SuggestionsResponse = { suggestions: Suggestion[]; model: string }

export function CpdTab({ staffId, canWrite }: { staffId: string; canWrite: boolean }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data, isLoading } = useQuery<{ items: Item[] }>({
    queryKey: ["staff-trainings", staffId],
    queryFn: async () => {
      const res = await fetch(`/api/staff/${staffId}/trainings`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Training & certifications</CardTitle>
          {canWrite && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Log training
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : data.items.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/30 p-8 text-center">
              <GraduationCap className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No training logged yet</p>
              <p className="text-xs text-muted-foreground">
                Add certifications, courses, and workshops to track development over time.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {data.items.map((t) => (
                <li key={t.id} className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.provider ?? "Self-paced"} ·{" "}
                        {dayjs(t.startDate).format("D MMM YYYY")}
                        {t.endDate ? ` – ${dayjs(t.endDate).format("D MMM YYYY")}` : ""}
                      </p>
                      {t.notes && <p className="mt-1 text-xs text-muted-foreground">{t.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {t.type.replace("_", " ")}
                      </Badge>
                      {t.certificateUrl && (
                        <a
                          href={t.certificateUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="inline h-3 w-3" /> view
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AiSuggestionsCard staffId={staffId} />


      {open && (
        <NewTrainingDialog
          staffId={staffId}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false)
            qc.invalidateQueries({ queryKey: ["staff-trainings", staffId] })
          }}
        />
      )}
    </div>
  )
}

function AiSuggestionsCard({ staffId }: { staffId: string }) {
  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai/training-suggestions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ staffId }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<SuggestionsResponse>
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const data = generate.data
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">
            <Sparkles className="mr-1 inline h-4 w-4 text-violet-600" />
            AI training suggestions
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Tailored to role, subjects taught, prior training, and recent appraisal scores.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
        >
          {generate.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
          {data ? "Regenerate" : "Generate"}
        </Button>
      </CardHeader>
      <CardContent>
        {!data ? (
          <p className="text-sm text-muted-foreground">
            Click <em>Generate</em> to fetch personalised suggestions.
          </p>
        ) : data.suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No suggestions returned.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {data.suggestions.map((s, i) => (
              <li key={i} className="rounded-md bg-violet-500/5 px-3 py-2">
                <p className="font-medium">{s.title}</p>
                {s.rationale && (
                  <p className="text-xs text-muted-foreground">{s.rationale}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {data?.model && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Generated via {data.model}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function NewTrainingDialog({
  staffId,
  onClose,
  onSaved,
}: {
  staffId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState("")
  const [provider, setProvider] = useState("")
  const [type, setType] = useState("COURSE")
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState("")
  const [certificateUrl, setCertificateUrl] = useState("")
  const [notes, setNotes] = useState("")

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/staff/${staffId}/trainings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, provider, type, startDate, endDate, certificateUrl, notes }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success("Training logged")
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log training / certification</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow label="Title" className="sm:col-span-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Google for Education Level 1" />
          </FieldRow>
          <FieldRow label="Provider">
            <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. NTI" />
          </FieldRow>
          <FieldRow label="Type">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CERTIFICATION">Certification</SelectItem>
                <SelectItem value="COURSE">Course</SelectItem>
                <SelectItem value="WORKSHOP">Workshop</SelectItem>
                <SelectItem value="CONFERENCE">Conference</SelectItem>
                <SelectItem value="IN_HOUSE">In-house</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Start date">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FieldRow>
          <FieldRow label="End date (optional)">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FieldRow>
          <FieldRow label="Certificate URL (optional)" className="sm:col-span-2">
            <Input value={certificateUrl} onChange={(e) => setCertificateUrl(e.target.value)} placeholder="https://…" />
          </FieldRow>
          <FieldRow label="Notes" className="sm:col-span-2">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FieldRow>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!title || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Log training
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FieldRow({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
