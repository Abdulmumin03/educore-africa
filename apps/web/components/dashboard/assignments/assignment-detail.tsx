"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Paperclip,
  Send,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RichBody } from "@/components/dashboard/announcements/rich-body"
import { renderMarkdown } from "@/lib/markdown"

type Attachment = { url: string; name: string; size: number; type: string }

type AssignmentSummary = {
  id: string
  title: string
  description: string | null
  instructionsMd: string | null
  dueDate: string
  maxScore: number
  allowLate: boolean
  attachments: Attachment[] | null
  subject: { id: string; name: string; code: string }
  teacher: { firstName: string; lastName: string }
  sections: { id: string; name: string; className: string }[]
}

type MyResponse = {
  mine: {
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

export function AssignmentDetail({
  isStudent,
  assignment,
}: {
  isStudent: boolean
  assignment: AssignmentSummary
}) {
  return (
    <div className="space-y-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/dashboard/assignments">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to assignments
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{assignment.title}</h1>
          <Badge variant="secondary" className="text-[10px]">
            {assignment.subject.code}
          </Badge>
          {assignment.allowLate && (
            <Badge variant="outline" className="text-[10px]">
              Late OK
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          <CalendarClock className="mr-1 inline h-3 w-3" />
          Due {dayjs(assignment.dueDate).format("D MMM YYYY · h:mm A")} · max {assignment.maxScore}
          {" · "}
          <Users className="mr-1 inline h-3 w-3" />
          {assignment.sections
            .map((s) => `${s.className}·${s.name}`)
            .slice(0, 3)
            .join(", ")}
          {assignment.sections.length > 3 ? `, +${assignment.sections.length - 3}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          By {assignment.teacher.firstName} {assignment.teacher.lastName}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          {assignment.description && (
            <p className="text-sm text-muted-foreground">{assignment.description}</p>
          )}
          {assignment.instructionsMd && (
            <RichBody html={renderMarkdown(assignment.instructionsMd)} />
          )}
          {assignment.attachments && assignment.attachments.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Attachments</p>
              <ul className="flex flex-wrap gap-2 text-xs">
                {assignment.attachments.map((a, i) => (
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
            </div>
          )}
        </CardContent>
      </Card>

      {isStudent && <StudentSubmissionPanel assignment={assignment} />}
    </div>
  )
}

function StudentSubmissionPanel({ assignment }: { assignment: AssignmentSummary }) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [text, setText] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)

  const my = useQuery<MyResponse>({
    queryKey: ["assignment-submission", assignment.id],
    queryFn: async () => {
      const res = await fetch(`/api/assignments/${assignment.id}/submissions`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/assignments/${assignment.id}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          textContent: text.trim() || undefined,
          attachments: attachments.length ? attachments : undefined,
        }),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Submit failed")
    },
    onSuccess: () => {
      toast.success("Submitted")
      setText("")
      setAttachments([])
      qc.invalidateQueries({ queryKey: ["assignment-submission", assignment.id] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  async function pickFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Max 10 MB")
      return
    }
    setUploading(true)
    try {
      const presign = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
          scope: "assignments",
        }),
      })
      if (!presign.ok) {
        const e = (await presign.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Upload not available")
      }
      const { uploadUrl, publicUrl } = (await presign.json()) as {
        uploadUrl: string
        publicUrl: string
      }
      const put = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type },
      })
      if (!put.ok) throw new Error("Upload failed")
      setAttachments((a) => [
        ...a,
        { url: publicUrl, name: file.name, size: file.size, type: file.type },
      ])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const mine = my.data?.mine
  const graded = !!mine?.gradedAt
  const submitted = !!mine
  const overdue = Date.now() > new Date(assignment.dueDate).getTime()
  const cannotSubmit = (overdue && !assignment.allowLate) || graded

  if (my.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Your submission</h2>
          {graded ? (
            <Badge>Graded · {mine?.score ?? "—"} / {assignment.maxScore}</Badge>
          ) : submitted ? (
            <Badge variant="outline">Submitted</Badge>
          ) : overdue ? (
            <Badge variant="outline" className="text-destructive">
              Overdue
            </Badge>
          ) : (
            <Badge variant="outline">Pending</Badge>
          )}
        </div>

        {mine && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Submitted {dayjs(mine.submittedAt).format("D MMM YYYY · h:mm A")}
            </p>
            {mine.textContent && (
              <p className="whitespace-pre-wrap text-sm">{mine.textContent}</p>
            )}
            {Array.isArray(mine.attachments) && mine.attachments.length > 0 && (
              <ul className="flex flex-wrap gap-2 text-xs">
                {mine.attachments.map((a, i) => (
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
            {graded && mine.feedback && (
              <div className="border-t pt-2">
                <p className="text-xs font-medium text-muted-foreground">Teacher feedback</p>
                <p className="text-sm">{mine.feedback}</p>
              </div>
            )}
          </div>
        )}

        {!cannotSubmit && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {submitted
                ? "Need to update? Resubmit before grading."
                : "Type your response or attach a file."}
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Text response (optional)</Label>
              <Textarea
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write your answer here…"
                maxLength={20000}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Files (optional)</Label>
              {attachments.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {attachments.map((a, i) => (
                    <li
                      key={i}
                      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
                    >
                      <Paperclip className="h-3 w-3" />
                      <span className="max-w-[180px] truncate">{a.name}</span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void pickFile(f)
                  e.target.value = ""
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || attachments.length >= 10}
              >
                {uploading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                )}
                Attach file
              </Button>
              <p className="text-[11px] text-muted-foreground">
                PDF or image, max 10 MB.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => submit.mutate()}
                disabled={
                  submit.isPending ||
                  uploading ||
                  (!text.trim() && attachments.length === 0)
                }
              >
                {submit.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-4 w-4" />
                )}
                {submitted ? "Resubmit" : "Submit"}
              </Button>
            </div>
          </div>
        )}

        {cannotSubmit && !graded && (
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Past due — your teacher disabled late submissions.
          </p>
        )}
        {graded && (
          <p className="flex items-center gap-1 rounded-md border bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <CheckCircle2 className="h-4 w-4" /> Graded — no further changes possible.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
