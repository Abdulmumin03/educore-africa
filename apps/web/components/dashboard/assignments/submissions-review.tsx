"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  MinusCircle,
  Paperclip,
  Save,
} from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type Attachment = { url: string; name: string; size: number; type: string }

type Row = {
  student: {
    id: string
    admissionNumber: string
    firstName: string
    lastName: string
    avatarUrl: string | null
    sectionId: string
    sectionName: string
    className: string
  }
  submission: {
    id: string
    submittedAt: string
    fileUrl: string | null
    attachments: Attachment[] | null
    textContent: string | null
    score: number | null
    feedback: string | null
    gradedAt: string | null
  } | null
}

type Response = {
  assignment: {
    id: string
    title: string
    dueDate: string
    maxScore: number
    allowLate: boolean
  }
  rows: Row[]
  totals: { expected: number; submitted: number; graded: number }
}

type Filter = "all" | "submitted" | "ungraded" | "missing"

function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

export function SubmissionsReview({
  assignmentId,
  title,
}: {
  assignmentId: string
  title: string
}) {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<Filter>("all")
  const [bulkScore, setBulkScore] = useState<string>("")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const list = useQuery<Response>({
    queryKey: ["assignment-submissions", assignmentId],
    queryFn: async () => {
      const res = await fetch(`/api/assignments/${assignmentId}/submissions`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const filtered = useMemo(() => {
    const all = list.data?.rows ?? []
    switch (filter) {
      case "submitted":
        return all.filter((r) => !!r.submission)
      case "ungraded":
        return all.filter((r) => r.submission && !r.submission.gradedAt)
      case "missing":
        return all.filter((r) => !r.submission)
      default:
        return all
    }
  }, [list.data, filter])

  const bulkGrade = useMutation({
    mutationFn: async () => {
      const score = Number(bulkScore)
      const ids = Array.from(selected)
      if (!Number.isFinite(score) || ids.length === 0) return
      const res = await fetch(`/api/assignments/${assignmentId}/submissions/bulk-grade`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ score, studentIds: ids }),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string; updated?: number }
      if (!res.ok) throw new Error(b.error ?? "Bulk grade failed")
      return b.updated ?? 0
    },
    onSuccess: (count) => {
      toast.success(`Graded ${count ?? 0} submission${count === 1 ? "" : "s"}`)
      setSelected(new Set())
      setBulkScore("")
      qc.invalidateQueries({ queryKey: ["assignment-submissions", assignmentId] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  function toggle(studentId: string) {
    const next = new Set(selected)
    if (next.has(studentId)) next.delete(studentId)
    else next.add(studentId)
    setSelected(next)
  }
  function toggleAll() {
    if (selected.size === filtered.filter((r) => r.submission).length) {
      setSelected(new Set())
    } else {
      const next = new Set<string>()
      for (const r of filtered) if (r.submission) next.add(r.student.id)
      setSelected(next)
    }
  }

  if (list.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </CardContent>
      </Card>
    )
  }
  if (!list.data) return null

  const { assignment, totals } = list.data

  return (
    <div className="space-y-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/dashboard/assignments">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to assignments
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Due {dayjs(assignment.dueDate).format("D MMM YYYY · h:mm A")} · max {assignment.maxScore}
          {" · "}
          {totals.submitted} of {totals.expected} submitted ·{" "}
          {totals.graded} graded
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip current={filter} value="all" onClick={setFilter}>
          All ({totals.expected})
        </FilterChip>
        <FilterChip current={filter} value="submitted" onClick={setFilter}>
          Submitted ({totals.submitted})
        </FilterChip>
        <FilterChip current={filter} value="ungraded" onClick={setFilter}>
          Ungraded ({totals.submitted - totals.graded})
        </FilterChip>
        <FilterChip current={filter} value="missing" onClick={setFilter}>
          Missing ({totals.expected - totals.submitted})
        </FilterChip>
      </div>

      {selected.size > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-3">
            <div>
              <Label className="text-xs">Bulk score</Label>
              <Input
                type="number"
                min={0}
                max={assignment.maxScore}
                value={bulkScore}
                onChange={(e) => setBulkScore(e.target.value)}
                className="w-24"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Apply to {selected.size} selected submission{selected.size === 1 ? "" : "s"}.
            </p>
            <div className="ml-auto flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
                disabled={bulkGrade.isPending}
              >
                Clear
              </Button>
              <Button
                size="sm"
                onClick={() => bulkGrade.mutate()}
                disabled={
                  !bulkScore ||
                  selected.size === 0 ||
                  bulkGrade.isPending ||
                  Number(bulkScore) < 0 ||
                  Number(bulkScore) > assignment.maxScore
                }
              >
                {bulkGrade.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Mark all
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={
                filtered.filter((r) => r.submission).length > 0 &&
                selected.size === filtered.filter((r) => r.submission).length
              }
              onChange={toggleAll}
              aria-label="Select all submitted"
              className="h-4 w-4"
            />
            <span>Select submitted</span>
            <span className="ml-auto">{filtered.length} student{filtered.length === 1 ? "" : "s"}</span>
          </div>
          <ul className="divide-y">
            {filtered.map((r) => (
              <li key={r.student.id}>
                <SubmissionRow
                  row={r}
                  assignmentId={assignmentId}
                  maxScore={assignment.maxScore}
                  dueDate={assignment.dueDate}
                  selected={selected.has(r.student.id)}
                  onToggle={() => toggle(r.student.id)}
                />
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">
                Nothing in this filter.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function FilterChip({
  current,
  value,
  onClick,
  children,
}: {
  current: Filter
  value: Filter
  onClick: (v: Filter) => void
  children: React.ReactNode
}) {
  const active = current === value
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        "rounded-full border px-3 py-1 text-xs",
        active ? "border-primary bg-primary/10 font-medium" : "border-input text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  )
}

function SubmissionRow({
  row,
  assignmentId,
  maxScore,
  dueDate,
  selected,
  onToggle,
}: {
  row: Row
  assignmentId: string
  maxScore: number
  dueDate: string
  selected: boolean
  onToggle: () => void
}) {
  const qc = useQueryClient()
  const [scoreInput, setScoreInput] = useState(
    row.submission?.score !== null && row.submission?.score !== undefined
      ? String(row.submission.score)
      : "",
  )
  const [feedbackInput, setFeedbackInput] = useState(row.submission?.feedback ?? "")

  const save = useMutation({
    mutationFn: async () => {
      if (!row.submission) return
      const score = scoreInput === "" ? null : Number(scoreInput)
      if (score !== null && (!Number.isFinite(score) || score < 0 || score > maxScore)) {
        throw new Error(`Score must be 0–${maxScore}`)
      }
      const res = await fetch(
        `/api/assignments/${assignmentId}/submissions/${row.submission.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ score, feedback: feedbackInput || null }),
        },
      )
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Save failed")
    },
    onSuccess: () => {
      toast.success("Graded")
      qc.invalidateQueries({ queryKey: ["assignment-submissions", assignmentId] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const submitted = !!row.submission
  const graded = !!row.submission?.gradedAt
  const wasLate =
    !!row.submission &&
    new Date(row.submission.submittedAt).getTime() > new Date(dueDate).getTime()

  return (
    <div className="space-y-2 px-3 py-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          disabled={!submitted}
          onChange={onToggle}
          aria-label="Select submission"
          className="mt-1 h-4 w-4"
        />
        <Avatar className="h-8 w-8 shrink-0">
          {row.student.avatarUrl ? <AvatarImage src={row.student.avatarUrl} alt="" /> : null}
          <AvatarFallback className="text-[10px]">
            {initials(row.student.firstName, row.student.lastName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {row.student.firstName} {row.student.lastName}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {row.student.admissionNumber} · {row.student.className} · Arm {row.student.sectionName}
          </p>
        </div>
        <div className="shrink-0">
          {graded ? (
            <Badge>
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {row.submission?.score ?? "—"} / {maxScore}
            </Badge>
          ) : submitted ? (
            <Badge variant="outline">
              <Clock className="mr-1 h-3 w-3" />
              {wasLate ? "Late" : "Submitted"}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <MinusCircle className="mr-1 h-3 w-3" />
              Missing
            </Badge>
          )}
        </div>
      </div>

      {submitted && (
        <div className="ml-7 space-y-2 rounded-md border bg-muted/30 p-3">
          {row.submission?.textContent && (
            <p className="whitespace-pre-wrap text-sm">{row.submission.textContent}</p>
          )}
          {Array.isArray(row.submission?.attachments) &&
            row.submission!.attachments!.length > 0 && (
              <ul className="flex flex-wrap gap-2 text-xs">
                {row.submission!.attachments!.map((a, i) => (
                  <li key={i}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 hover:bg-muted"
                    >
                      <Paperclip className="h-3 w-3" />
                      {a.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          <p className="text-[11px] text-muted-foreground">
            Submitted {dayjs(row.submission!.submittedAt).format("D MMM YYYY · h:mm A")}
          </p>

          <div className="grid gap-2 sm:grid-cols-[100px_1fr_auto]">
            <div>
              <Label className="text-xs">Score</Label>
              <Input
                type="number"
                min={0}
                max={maxScore}
                value={scoreInput}
                onChange={(e) => setScoreInput(e.target.value)}
                placeholder={`0–${maxScore}`}
              />
            </div>
            <div>
              <Label className="text-xs">Feedback</Label>
              <Textarea
                rows={2}
                value={feedbackInput}
                onChange={(e) => setFeedbackInput(e.target.value)}
                placeholder="Optional comments…"
                maxLength={4000}
              />
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                onClick={() => save.mutate()}
                disabled={save.isPending}
              >
                {save.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-4 w-4" />
                )}
                {graded ? "Update" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
