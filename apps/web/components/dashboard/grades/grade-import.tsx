"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { CheckCircle2, Download, FileWarning, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

type ClassOpt = { id: string; name: string; sections: { id: string; name: string }[] }
type SubjectOpt = { id: string; name: string; code: string }
type TermOpt = { id: string; type: string; sessionName: string; isCurrent: boolean; sessionIsCurrent: boolean }

type Valid = {
  ok: true
  admissionNumber: string
  studentId: string
  caComponents: Record<string, number>
  examScore: number
  teacherRemark: string | null
}
type Invalid = { ok: false; admissionNumber: string; reason: string }

type PreviewResponse = {
  preview: true
  counts: { total: number; valid: number; invalid: number }
  valid: Valid[]
  invalid: Invalid[]
}

type CommitResponse = {
  preview: false
  counts: { total: number; valid: number; invalid: number }
  invalid: Invalid[]
}

export function GradeImportClient({
  classes,
  subjects,
  terms,
}: {
  classes: ClassOpt[]
  subjects: SubjectOpt[]
  terms: TermOpt[]
}) {
  const defaultTerm = terms.find((t) => t.isCurrent && t.sessionIsCurrent) ?? terms[0]
  const [classId, setClassId] = useState(classes[0]?.id ?? "")
  const [sectionId, setSectionId] = useState(classes[0]?.sections[0]?.id ?? "")
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "")
  const [termId, setTermId] = useState(defaultTerm?.id ?? "")
  const [csv, setCsv] = useState<string>("")
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const arms = classes.find((c) => c.id === classId)?.sections ?? []
  useEffect(() => {
    if (arms.length > 0 && !arms.find((a) => a.id === sectionId)) setSectionId(arms[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId])

  const subjLabel = useMemo(() => subjects.find((s) => s.id === subjectId)?.code ?? "", [subjects, subjectId])

  function downloadTemplate() {
    if (!sectionId || !subjectId) return
    const url = `/api/grades/template?sectionId=${sectionId}&subjectId=${subjectId}`
    window.open(url, "_blank")
  }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? "")
      setCsv(text)
      setPreview(null)
    }
    reader.readAsText(file)
  }

  const previewMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/grades/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId,
          sectionId,
          termId,
          subjectId,
          csv,
          commit: false,
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<PreviewResponse>
    },
    onSuccess: (d) => {
      setPreview(d)
      toast.message(`Preview: ${d.counts.valid} valid · ${d.counts.invalid} invalid`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const commit = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/grades/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId,
          sectionId,
          termId,
          subjectId,
          csv,
          commit: true,
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<CommitResponse>
    },
    onSuccess: (d) => {
      toast.success(`Imported ${d.counts.valid} row(s)${d.counts.invalid > 0 ? `, skipped ${d.counts.invalid}` : ""}`)
      setPreview(null)
      setCsv("")
      if (fileRef.current) fileRef.current.value = ""
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bulk grade import</h1>
        <p className="text-sm text-muted-foreground">
          Download the class CSV, fill in scores, then upload to validate before commit.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
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
          <Field label="Arm">
            <Select value={sectionId} onValueChange={setSectionId} disabled={arms.length === 0}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {arms.map((a) => (
                  <SelectItem key={a.id} value={a.id}>Arm {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Subject">
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Get the template</CardTitle>
          <CardDescription>
            Pre-fills admission numbers + names for the selected arm.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="sm" variant="outline" onClick={downloadTemplate} disabled={!sectionId || !subjectId}>
            <Download className="mr-1.5 h-4 w-4" />
            Download CSV template
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Upload the filled CSV</CardTitle>
          <CardDescription>
            We&apos;ll validate every row before writing anything.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" />
              Choose CSV
            </Button>
            {csv && (
              <span className="text-xs text-muted-foreground">
                {csv.split("\n").length} lines · {(csv.length / 1024).toFixed(1)} KB
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => previewMut.mutate()}
              disabled={!csv || previewMut.isPending}
            >
              {previewMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Preview
            </Button>
            <Button
              size="sm"
              onClick={() => commit.mutate()}
              disabled={!preview || preview.counts.valid === 0 || commit.isPending}
            >
              {commit.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Import {preview ? `${preview.counts.valid} valid row(s)` : "rows"}
            </Button>
          </div>

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="default">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {preview.counts.valid} valid
                </Badge>
                {preview.counts.invalid > 0 && (
                  <Badge variant="destructive">
                    <FileWarning className="mr-1 h-3 w-3" />
                    {preview.counts.invalid} invalid
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  Subject: {subjLabel}
                </span>
              </div>

              {preview.invalid.length > 0 && (
                <Card className="border-destructive/30 bg-destructive/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-destructive">Invalid rows</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Admission no.</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.invalid.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{row.admissionNumber}</TableCell>
                            <TableCell className="text-xs">{row.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {preview.valid.length > 0 && (
                <Card className="border-emerald-500/30 bg-emerald-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Valid rows (preview)</CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-64 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Admission no.</TableHead>
                          <TableHead>Components</TableHead>
                          <TableHead className="text-right">Exam</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.valid.slice(0, 50).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{row.admissionNumber}</TableCell>
                            <TableCell className="text-xs">
                              {Object.entries(row.caComponents)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" · ")}
                            </TableCell>
                            <TableCell className="text-right text-xs">{row.examScore}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {preview.valid.length > 50 && (
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        Showing first 50 of {preview.valid.length}.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
