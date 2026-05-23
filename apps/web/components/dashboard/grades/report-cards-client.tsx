"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Download,
  FileText,
  Loader2,
  Lock,
  LockOpen,
  MessageSquare,
  Pencil,
  Share2,
  Sparkles,
} from "lucide-react"
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

type ExamBody = "WAEC" | "CAMBRIDGE" | "IB" | "NECO" | "NONE"
type ClassOpt = {
  id: string
  name: string
  examBodyCode: ExamBody
  sections: { id: string; name: string }[]
}
type TermOpt = { id: string; type: string; sessionName: string; isCurrent: boolean; sessionIsCurrent: boolean }

type RankItem = {
  studentId: string
  name: string
  admissionNumber: string
  className: string | null
  sectionName: string | null
  position: number | null
  average: number | null
}

type AnalyticsResponse = { ranking: RankItem[] }

type ReportCardJson = {
  reportCardId: string | null
  lockedAt: string | null
  classTeacherComment: string | null
  principalComment: string | null
  aiPrincipal: boolean
}

export function ReportCardsClient({
  canWrite,
  classes,
  terms,
}: {
  canWrite: boolean
  classes: ClassOpt[]
  terms: TermOpt[]
}) {
  const qc = useQueryClient()
  const defaultTerm = terms.find((t) => t.isCurrent && t.sessionIsCurrent) ?? terms[0]
  const [classId, setClassId] = useState(classes[0]?.id ?? "")
  const [sectionId, setSectionId] = useState(classes[0]?.sections[0]?.id ?? "")
  const [termId, setTermId] = useState(defaultTerm?.id ?? "")
  const [withAi, setWithAi] = useState(true)

  const currentClass = classes.find((c) => c.id === classId)
  const arms = currentClass?.sections ?? []
  const isSeniorClass = !!currentClass?.name.toLowerCase().startsWith("ss")
  // Gate per the class's curriculum exam body. SS classes with "NONE" still
  // get WAEC (legacy schools whose curriculum was backfilled without an exam
  // body tag).
  const showWaec =
    currentClass?.examBodyCode === "WAEC" ||
    currentClass?.examBodyCode === "NECO" ||
    (currentClass?.examBodyCode === "NONE" && isSeniorClass)
  const showCambridge = currentClass?.examBodyCode === "CAMBRIDGE"

  useEffect(() => {
    if (arms.length > 0 && !arms.find((a) => a.id === sectionId)) setSectionId(arms[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId])

  const rankingQuery = useQuery<AnalyticsResponse>({
    queryKey: ["report-card-ranking", classId, sectionId, termId],
    queryFn: async () => {
      const p = new URLSearchParams()
      p.set("termId", termId)
      if (sectionId) p.set("sectionId", sectionId)
      else if (classId) p.set("classId", classId)
      const res = await fetch(`/api/grades/analytics?${p}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: !!termId && (!!sectionId || !!classId),
  })

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/grades/report-cards/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId,
          sectionId: sectionId || undefined,
          termId,
          withAiRemarks: false,
          withAiPrincipal: withAi,
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ generated: number; skipped: number; total: number }>
    },
    onSuccess: (d) => {
      toast.success(`Generated ${d.generated} report card(s)${d.skipped > 0 ? `, skipped ${d.skipped}` : ""}`)
      qc.invalidateQueries({ queryKey: ["report-card-ranking", classId, sectionId, termId] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const downloadZip = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/grades/report-cards/zip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId,
          sectionId: sectionId || undefined,
          termId,
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => "Failed")
        throw new Error(text || "Failed")
      }
      const blob = await res.blob()
      const filename =
        res.headers
          .get("content-disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? "report-cards.zip"
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    },
    onSuccess: () => toast.success("ZIP downloaded"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Report cards</h1>
        <p className="text-sm text-muted-foreground">
          Generate, edit, lock, and share per-student report cards. Bulk-download as a ZIP.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <Field label="Class">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Arm (optional)">
            <Select
              value={sectionId || "__all__"}
              onValueChange={(v) => setSectionId(v === "__all__" ? "" : v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All arms</SelectItem>
                {arms.map((a) => (
                  <SelectItem key={a.id} value={a.id}>Arm {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Term">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.sessionName} · {t.type[0] + t.type.slice(1).toLowerCase()}
                    {t.isCurrent ? " · current" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bulk actions</CardTitle>
            <CardDescription>
              Generate cached `ReportCard` rows (skips locked), then download a class ZIP of PDFs.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={withAi}
                onChange={(e) => setWithAi(e.target.checked)}
                className="h-4 w-4"
              />
              <Sparkles className="h-3.5 w-3.5 text-violet-600" />
              AI-draft principal comments where missing
            </label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadZip.mutate()}
                disabled={downloadZip.isPending}
              >
                {downloadZip.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-4 w-4" />
                )}
                Download all PDFs (ZIP)
              </Button>
              <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
                {generate.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Generate
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Students</CardTitle>
          <CardDescription>
            Per-row: edit comments, lock, download PDF, share, SMS parent
            {showWaec && ", download mock WAEC sheet"}
            {showCambridge && ", download mock Cambridge sheet"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rankingQuery.isLoading || !rankingQuery.data ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rankingQuery.data.ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students enrolled.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Adm. no.</TableHead>
                  <TableHead className="text-right">Average</TableHead>
                  <TableHead className="text-right">Position</TableHead>
                  <TableHead className="w-[480px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankingQuery.data.ranking.map((r) => (
                  <RankRow
                    key={r.studentId}
                    row={r}
                    termId={termId}
                    canWrite={canWrite}
                    showWaec={showWaec}
                    showCambridge={showCambridge}
                    onChanged={() =>
                      qc.invalidateQueries({
                        queryKey: ["report-card-ranking", classId, sectionId, termId],
                      })
                    }
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RankRow({
  row,
  termId,
  canWrite,
  showWaec,
  showCambridge,
  onChanged,
}: {
  row: RankItem
  termId: string
  canWrite: boolean
  showWaec: boolean
  showCambridge: boolean
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)

  // We only need the existing ReportCard row's lock state + comments for the
  // edit modal. Lazy-fetch on first render via a small query.
  const card = useQuery<ReportCardJson>({
    queryKey: ["report-card-row", row.studentId, termId],
    queryFn: async () => {
      const res = await fetch(`/api/grades/report-cards/${row.studentId}?termId=${termId}`)
      if (!res.ok) throw new Error("Failed")
      const json = (await res.json()) as {
        reportCardId: string | null
        lockedAt: string | null
        classTeacherComment: string | null
        principalComment: string | null
        aiPrincipal: boolean
      }
      return {
        reportCardId: json.reportCardId,
        lockedAt: json.lockedAt,
        classTeacherComment: json.classTeacherComment,
        principalComment: json.principalComment,
        aiPrincipal: json.aiPrincipal,
      }
    },
    enabled: !!termId,
  })

  function downloadPdf() {
    window.open(`/api/grades/report-cards/${row.studentId}?termId=${termId}&format=pdf`, "_blank")
  }
  function downloadWaec() {
    window.open(`/api/grades/report-cards/${row.studentId}/waec?termId=${termId}`, "_blank")
  }
  function downloadCambridge() {
    window.open(
      `/api/grades/report-cards/${row.studentId}/cambridge?termId=${termId}`,
      "_blank",
    )
  }

  const share = useMutation({
    mutationFn: async (sendSms: boolean) => {
      const reportCardId = card.data?.reportCardId
      if (!reportCardId) throw new Error("Report card not generated yet — click Generate first")
      const res = await fetch("/api/grades/report-cards/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportCardId, expiresInDays: 30, sendSms }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ url: string; sms?: { ok: boolean; error?: string } | null }>
    },
    onSuccess: (d) => {
      if (d.sms?.ok) toast.success("SMS sent to primary guardian")
      else if (d.sms && !d.sms.ok) toast.error(`SMS failed: ${d.sms.error}`)
      else toast.success("Share link created · copied to clipboard")
      navigator.clipboard?.writeText(d.url).catch(() => null)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const initials = (row.name.split(" ")[0]?.[0] ?? "") + (row.name.split(" ").slice(-1)[0]?.[0] ?? "")
  const locked = !!card.data?.lockedAt
  const generated = !!card.data?.reportCardId

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
            </Avatar>
            <span>
              <span className="block text-sm font-medium">{row.name}</span>
              <span className="block text-[10px] text-muted-foreground">
                {row.className} · Arm {row.sectionName}
              </span>
            </span>
            {locked && (
              <Badge variant="default" className="text-[9px]">
                <Lock className="mr-0.5 h-2.5 w-2.5" />
                locked
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="font-mono text-xs">{row.admissionNumber}</TableCell>
        <TableCell className="text-right font-mono text-xs font-semibold">
          {row.average === null ? "—" : `${row.average}%`}
        </TableCell>
        <TableCell className="text-right text-xs">{row.position ?? "—"}</TableCell>
        <TableCell className="text-right">
          <div className="flex flex-wrap justify-end gap-1">
            {canWrite && generated && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(true)}
                title={locked ? "View / unlock" : "Edit comments"}
              >
                <Pencil className="mr-1 h-3 w-3" /> {locked ? "View" : "Edit"}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={downloadPdf}>
              <FileText className="mr-1 h-3 w-3" /> PDF
            </Button>
            {showWaec && (
              <Button size="sm" variant="ghost" onClick={downloadWaec} title="Mock WAEC summary">
                <FileText className="mr-1 h-3 w-3" /> WAEC
              </Button>
            )}
            {showCambridge && (
              <Button
                size="sm"
                variant="ghost"
                onClick={downloadCambridge}
                title="Mock Cambridge summary"
              >
                <FileText className="mr-1 h-3 w-3" /> Cambridge
              </Button>
            )}
            {canWrite && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => share.mutate(false)}
                  disabled={share.isPending || !generated}
                >
                  <Share2 className="mr-1 h-3 w-3" /> Link
                </Button>
                <Button
                  size="sm"
                  onClick={() => share.mutate(true)}
                  disabled={share.isPending || !generated}
                >
                  {share.isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <MessageSquare className="mr-1 h-3 w-3" />
                  )}
                  SMS
                </Button>
              </>
            )}
          </div>
        </TableCell>
      </TableRow>

      {editing && card.data?.reportCardId && (
        <EditReportCardDialog
          reportCardId={card.data.reportCardId}
          studentName={row.name}
          initialTeacher={card.data.classTeacherComment ?? ""}
          initialPrincipal={card.data.principalComment ?? ""}
          initialAiPrincipal={card.data.aiPrincipal}
          locked={locked}
          canLock={canWrite}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            card.refetch()
            onChanged()
          }}
        />
      )}
    </>
  )
}

function EditReportCardDialog({
  reportCardId,
  studentName,
  initialTeacher,
  initialPrincipal,
  initialAiPrincipal,
  locked,
  canLock,
  onClose,
  onSaved,
}: {
  reportCardId: string
  studentName: string
  initialTeacher: string
  initialPrincipal: string
  initialAiPrincipal: boolean
  locked: boolean
  canLock: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [teacherComment, setTeacherComment] = useState(initialTeacher)
  const [principalComment, setPrincipalComment] = useState(initialPrincipal)

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/grades/report-cards/edit/${reportCardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classTeacherComment: teacherComment.trim() || null,
          principalComment: principalComment.trim() || null,
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
    },
    onSuccess: () => {
      toast.success("Comments saved")
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const lock = useMutation({
    mutationFn: async (action: "lock" | "unlock") => {
      const res = await fetch(`/api/grades/report-cards/edit/${reportCardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lockAction: action }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return action
    },
    onSuccess: (action) => {
      toast.success(action === "lock" ? "Locked" : "Unlocked")
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Report card for {studentName}
            {locked && (
              <Badge variant="default" className="ml-2 text-[10px]">
                <Lock className="mr-0.5 h-2.5 w-2.5" /> locked
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {locked
              ? "This card is locked — unlock to edit. The PDF render uses these comments."
              : "Edit teacher and principal comments. Saves are reflected in the PDF immediately."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Class teacher comment">
            <Textarea
              rows={3}
              value={teacherComment}
              onChange={(e) => setTeacherComment(e.target.value)}
              disabled={locked}
              placeholder="Empty = no teacher comment on the PDF."
            />
          </Field>
          <Field label="Principal comment">
            <Textarea
              rows={4}
              value={principalComment}
              onChange={(e) => setPrincipalComment(e.target.value)}
              disabled={locked}
              placeholder="Auto-drafted by AI on bulk generate if blank."
            />
            {initialAiPrincipal && (
              <p className="text-[10px] text-muted-foreground">
                <Sparkles className="mr-0.5 inline h-3 w-3 text-violet-600" />
                Originally AI-drafted. Your edits override.
              </p>
            )}
          </Field>
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose} disabled={save.isPending || lock.isPending}>
            Close
          </Button>
          {canLock && (
            locked ? (
              <Button
                variant="outline"
                onClick={() => lock.mutate("unlock")}
                disabled={lock.isPending}
              >
                {lock.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                <LockOpen className="mr-1.5 h-4 w-4" /> Unlock
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => lock.mutate("lock")}
                disabled={lock.isPending}
              >
                {lock.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                <Lock className="mr-1.5 h-4 w-4" /> Lock
              </Button>
            )
          )}
          {!locked && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save comments
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
