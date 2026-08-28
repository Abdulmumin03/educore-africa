"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle,
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

type ClassOpt = { id: string; name: string; sections: { id: string; name: string }[] }
type TermOpt = {
  id: string
  type: string
  sessionName: string
  isCurrent: boolean
  sessionIsCurrent: boolean
}

type RankItem = {
  studentId: string
  name: string
  admissionNumber: string
  className: string | null
  sectionName: string | null
  total: number
  average: number | null
  midtermReportId: string | null
  lockedAt: string | null
  hasClassTeacherComment: boolean
  hasPrincipalComment: boolean
}

type ListResponse = {
  midtermComponents: string[]
  curriculumCode: string | null
  curriculumName: string | null
  ranking: RankItem[]
}

type MidtermReportJson = {
  classTeacherComment: string | null
  principalComment: string | null
  lockedAt: string | null
  midtermReportId: string | null
}

export function MidtermReportsClient({
  canWrite,
  isPrivileged,
  classes,
  terms,
}: {
  canWrite: boolean
  isPrivileged: boolean
  classes: ClassOpt[]
  terms: TermOpt[]
}) {
  const qc = useQueryClient()
  const defaultTerm = terms.find((t) => t.isCurrent && t.sessionIsCurrent) ?? terms[0]
  const [classId, setClassId] = useState<string>(classes[0]?.id ?? "")
  const [sectionId, setSectionId] = useState<string>(classes[0]?.sections[0]?.id ?? "")
  const [termId, setTermId] = useState<string>(defaultTerm?.id ?? "")

  const currentClass = classes.find((c) => c.id === classId)
  // `?? []` is a fresh array each render; without the memo the effect below
  // fires on every one.
  const arms = useMemo(() => currentClass?.sections ?? [], [currentClass])

  useEffect(() => {
    if (arms.length > 0 && !arms.find((a) => a.id === sectionId)) setSectionId(arms[0].id)
  }, [arms, sectionId])

  const listQuery = useQuery<ListResponse>({
    queryKey: ["midterm-list", classId, sectionId, termId],
    queryFn: async () => {
      const p = new URLSearchParams({ termId })
      if (sectionId) p.set("sectionId", sectionId)
      else if (classId) p.set("classId", classId)
      const res = await fetch(`/api/grades/midterm-reports?${p}`)
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      return res.json()
    },
    enabled: !!termId && !!classId,
  })

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/grades/midterm-reports/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classId, sectionId: sectionId || undefined, termId }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ generated: number; skipped: number; total: number }>
    },
    onSuccess: (d) => {
      toast.success(
        `Initialised ${d.generated} midterm report(s)${d.skipped > 0 ? `, skipped ${d.skipped} locked` : ""}`,
      )
      qc.invalidateQueries({ queryKey: ["midterm-list", classId, sectionId, termId] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const downloadZip = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/grades/midterm-reports/zip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classId, sectionId: sectionId || undefined, termId }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => "Failed")
        throw new Error(text || `Request failed (${res.status})`)
      }
      const blob = await res.blob()
      const filename =
        res.headers
          .get("content-disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? "midterm-reports.zip"
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      return res.headers.get("x-skipped-count") ?? "0"
    },
    onSuccess: (skipped) => {
      const n = Number(skipped)
      toast.success(`ZIP downloaded${n > 0 ? `, skipped ${n}` : ""}`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const componentsLine =
    listQuery.data && listQuery.data.midtermComponents.length > 0
      ? `Midterm = ${listQuery.data.midtermComponents.join(" + ")}`
      : "No midterm components configured for this class's curriculum — set them in Settings → Curricula."

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Midterm reports</h1>
        <p className="text-sm text-muted-foreground">
          Live scores from teachers&apos; component entries — no full-term aggregation, no
          letter grades. Comments are saved per student.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Scope</CardTitle>
          <CardDescription>{componentsLine}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Class">
              <Select
                value={classId}
                onValueChange={(v) => {
                  setClassId(v)
                  setSectionId(classes.find((c) => c.id === v)?.sections[0]?.id ?? "")
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Arm">
              <Select value={sectionId} onValueChange={setSectionId} disabled={arms.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick an arm" />
                </SelectTrigger>
                <SelectContent>
                  {arms.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      Arm {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Term">
              <Select value={termId} onValueChange={setTermId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.type[0] + t.type.slice(1).toLowerCase()} · {t.sessionName}
                      {t.isCurrent && t.sessionIsCurrent ? " · current" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-end gap-2">
              {canWrite && (
                <Button
                  size="sm"
                  onClick={() => generate.mutate()}
                  disabled={generate.isPending || !termId || !classId}
                >
                  {generate.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 h-4 w-4" />
                  )}
                  Initialise rows
                </Button>
              )}
              {canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadZip.mutate()}
                  disabled={downloadZip.isPending || !termId || !classId}
                  title="Download every active student's midterm PDF as a single ZIP"
                >
                  {downloadZip.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 h-4 w-4" />
                  )}
                  ZIP all PDFs
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Students</CardTitle>
          <CardDescription>
            Click a row&apos;s Edit to capture class teacher + principal comments. Download the
            midterm PDF per student.
            {listQuery.data?.curriculumCode
              ? ` · Curriculum: ${listQuery.data.curriculumName ?? listQuery.data.curriculumCode}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : listQuery.isError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Couldn&apos;t load list:{" "}
                {listQuery.error instanceof Error ? listQuery.error.message : "Unknown error"}
              </span>
            </div>
          ) : !listQuery.data || listQuery.data.ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students enrolled.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Adm. no.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Average</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="w-[260px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQuery.data.ranking.map((r) => (
                  <MidtermRow
                    key={r.studentId}
                    row={r}
                    termId={termId}
                    canWrite={canWrite}
                    isPrivileged={isPrivileged}
                    onChanged={() =>
                      qc.invalidateQueries({
                        queryKey: ["midterm-list", classId, sectionId, termId],
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

function MidtermRow({
  row,
  termId,
  canWrite,
  isPrivileged,
  onChanged,
}: {
  row: RankItem
  termId: string
  canWrite: boolean
  isPrivileged: boolean
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const locked = !!row.lockedAt

  function downloadPdf() {
    window.open(
      `/api/grades/midterm-reports/${row.studentId}?termId=${termId}&format=pdf`,
      "_blank",
    )
  }

  const share = useMutation({
    mutationFn: async (sendSms: boolean) => {
      const res = await fetch("/api/grades/midterm-reports/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId: row.studentId,
          termId,
          expiresInDays: 14,
          sendSms,
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{
        url: string
        sms?: { ok: boolean; error?: string } | null
      }>
    },
    onSuccess: (d) => {
      if (d.sms?.ok) toast.success("SMS sent to primary guardian")
      else if (d.sms && !d.sms.ok) toast.error(`SMS failed: ${d.sms.error}`)
      else toast.success("Share link created · copied to clipboard")
      navigator.clipboard?.writeText(d.url).catch(() => null)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <>
      <TableRow>
        <TableCell className="text-sm">{row.name}</TableCell>
        <TableCell className="font-mono text-xs">{row.admissionNumber}</TableCell>
        <TableCell className="text-right text-xs font-medium tabular-nums">
          {row.total.toFixed(1)}
        </TableCell>
        <TableCell className="text-right text-xs font-medium tabular-nums">
          {row.average === null ? "—" : `${row.average.toFixed(1)}`}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            {locked && (
              <Badge variant="default" className="text-[9px]">
                <Lock className="mr-0.5 h-2.5 w-2.5" />
                locked
              </Badge>
            )}
            {row.hasClassTeacherComment && (
              <Badge variant="outline" className="text-[9px]">
                CT
              </Badge>
            )}
            {row.hasPrincipalComment && (
              <Badge variant="outline" className="text-[9px]">
                P
              </Badge>
            )}
            {!locked &&
              !row.hasClassTeacherComment &&
              !row.hasPrincipalComment && (
                <span className="text-[10px] text-muted-foreground">—</span>
              )}
          </div>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex flex-wrap justify-end gap-1">
            {canWrite && (
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
            {canWrite && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => share.mutate(false)}
                  disabled={share.isPending}
                  title="Create a parent-facing link (copies to clipboard)"
                >
                  <Share2 className="mr-1 h-3 w-3" /> Link
                </Button>
                <Button
                  size="sm"
                  onClick={() => share.mutate(true)}
                  disabled={share.isPending}
                  title="Create link and SMS the primary guardian"
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

      {editing && (
        <EditMidtermDialog
          studentId={row.studentId}
          studentName={row.name}
          termId={termId}
          isPrivileged={isPrivileged}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onChanged()
          }}
        />
      )}
    </>
  )
}

function EditMidtermDialog({
  studentId,
  studentName,
  termId,
  isPrivileged,
  onClose,
  onSaved,
}: {
  studentId: string
  studentName: string
  termId: string
  isPrivileged: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const detail = useQuery<MidtermReportJson>({
    queryKey: ["midterm-detail", studentId, termId],
    queryFn: async () => {
      const res = await fetch(`/api/grades/midterm-reports/${studentId}?termId=${termId}`)
      if (!res.ok) throw new Error("Failed")
      const json = (await res.json()) as {
        classTeacherComment: string | null
        principalComment: string | null
        lockedAt: string | null
        midtermReportId: string | null
      }
      return json
    },
  })

  const [teacherComment, setTeacherComment] = useState("")
  const [principalComment, setPrincipalComment] = useState("")

  useEffect(() => {
    if (detail.data) {
      setTeacherComment(detail.data.classTeacherComment ?? "")
      setPrincipalComment(detail.data.principalComment ?? "")
    }
  }, [detail.data])

  const locked = !!detail.data?.lockedAt

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { termId }
      body.classTeacherComment = teacherComment.trim() || null
      if (isPrivileged) body.principalComment = principalComment.trim() || null
      const res = await fetch(`/api/grades/midterm-reports/${studentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
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

  const aiComment = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/grades/midterm-reports/${studentId}/ai-comment?termId=${termId}`,
        { method: "POST" },
      )
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ principalComment: string }>
    },
    onSuccess: (d) => {
      setPrincipalComment(d.principalComment)
      toast.success("Drafted by AI — review then Save")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const lock = useMutation({
    mutationFn: async (action: "lock" | "unlock") => {
      const method = action === "lock" ? "POST" : "DELETE"
      const res = await fetch(
        `/api/grades/midterm-reports/${studentId}/lock?termId=${termId}`,
        { method },
      )
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Midterm comments — {studentName}</DialogTitle>
          <DialogDescription>
            {locked
              ? "This report is locked. Unlock to edit."
              : "Both fields are optional. Class teacher is editable by any teacher; principal comment is admin/principal only."}
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Class teacher comment</Label>
              <Textarea
                value={teacherComment}
                onChange={(e) => setTeacherComment(e.target.value)}
                rows={3}
                disabled={locked}
                placeholder="Brief observation on the student's midterm performance."
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">
                  Principal comment {isPrivileged ? "" : "(privileged only)"}
                </Label>
                {isPrivileged && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => aiComment.mutate()}
                    disabled={locked || aiComment.isPending}
                  >
                    {aiComment.isPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Draft with AI
                  </Button>
                )}
              </div>
              <Textarea
                value={principalComment}
                onChange={(e) => setPrincipalComment(e.target.value)}
                rows={3}
                disabled={locked || !isPrivileged}
                placeholder="2–3 sentences. Optional."
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            {isPrivileged && detail.data?.midtermReportId && (
              locked ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => lock.mutate("unlock")}
                  disabled={lock.isPending}
                >
                  <LockOpen className="mr-1.5 h-3.5 w-3.5" /> Unlock
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => lock.mutate("lock")}
                  disabled={lock.isPending}
                >
                  <Lock className="mr-1.5 h-3.5 w-3.5" /> Lock
                </Button>
              )
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {locked ? "Close" : "Cancel"}
            </Button>
            {!locked && (
              <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
