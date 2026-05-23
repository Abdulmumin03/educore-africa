"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import {
  CalendarClock,
  ClipboardList,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AssignmentDialog } from "@/components/dashboard/assignments/assignment-dialog"
import { RichBody } from "@/components/dashboard/announcements/rich-body"
import { renderMarkdown } from "@/lib/markdown"

type ClassOpt = {
  id: string
  name: string
  sections: { id: string; name: string }[]
}
type SubjectOpt = { id: string; name: string; code: string }

export type Assignment = {
  id: string
  title: string
  description: string | null
  instructionsMd: string | null
  dueDate: string
  maxScore: number
  allowLate: boolean
  attachments: { url: string; name: string; size: number; type: string }[] | null
  sectionIds: string[]
  sections: { id: string; name: string; className: string }[]
  subject: { id: string; name: string; code: string }
  teacher: { id: string; firstName: string; lastName: string }
  submissionCount: number
  expectedCount: number
  status: "ACTIVE" | "PAST"
  mine: { id: string; submittedAt: string; score: number | null; graded: boolean } | null
}

type StatusFilter = "all" | "active" | "past"

export function AssignmentsManager({
  currentUserId,
  currentUserRole,
  canWrite,
  classes,
  subjects,
}: {
  currentUserId: string
  currentUserRole: string
  canWrite: boolean
  classes: ClassOpt[]
  subjects: SubjectOpt[]
}) {
  const router = useRouter()
  const qc = useQueryClient()
  const [status, setStatus] = useState<StatusFilter>("all")
  const [composeOpen, setComposeOpen] = useState(false)
  const [editing, setEditing] = useState<Assignment | null>(null)

  const list = useQuery<{ items: Assignment[] }>({
    queryKey: ["assignments", status],
    queryFn: async () => {
      const p = new URLSearchParams({ status })
      const res = await fetch(`/api/assignments?${p}`)
      if (!res.ok) throw new Error("Failed to load assignments")
      return res.json()
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/assignments/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? "Delete failed")
      }
    },
    onSuccess: () => {
      toast.success("Assignment removed")
      qc.invalidateQueries({ queryKey: ["assignments"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  // For student view we render a different grouping further down.
  const isStudent = currentUserRole === "STUDENT"
  const items = list.data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assignments</h1>
          <p className="text-sm text-muted-foreground">
            {isStudent
              ? "Coursework set by your teachers."
              : canWrite
                ? "Set tasks, track submissions, and grade work."
                : "Coursework set by teachers in your school."}
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setComposeOpen(true)} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            New assignment
          </Button>
        )}
      </div>

      {!isStudent && (
        <Tabs value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {list.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">No assignments yet</p>
            <p className="text-xs text-muted-foreground">
              {canWrite ? "Create your first assignment to get started." : "Check back later."}
            </p>
            {canWrite && (
              <Button size="sm" className="mt-2" onClick={() => setComposeOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                New assignment
              </Button>
            )}
          </CardContent>
        </Card>
      ) : isStudent ? (
        <StudentAssignmentGroups items={items} />
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id}>
              <AssignmentRow
                item={a}
                currentUserId={currentUserId}
                canEdit={canWrite && (a.teacher.id === currentUserId || (currentUserRole !== "TEACHER"))}
                onEdit={() => setEditing(a)}
                onDelete={() => {
                  if (typeof window !== "undefined" && !window.confirm(`Delete "${a.title}"?`)) return
                  remove.mutate(a.id)
                }}
                onViewSubmissions={() => router.push(`/dashboard/assignments/${a.id}/submissions`)}
              />
            </li>
          ))}
        </ul>
      )}

      {composeOpen && (
        <AssignmentDialog
          mode="create"
          classes={classes}
          subjects={subjects}
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          onSaved={() => {
            setComposeOpen(false)
            qc.invalidateQueries({ queryKey: ["assignments"] })
          }}
        />
      )}
      {editing && (
        <AssignmentDialog
          mode="edit"
          initial={editing}
          classes={classes}
          subjects={subjects}
          open={!!editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            qc.invalidateQueries({ queryKey: ["assignments"] })
          }}
        />
      )}
    </div>
  )
}

function AssignmentRow({
  item,
  canEdit,
  onEdit,
  onDelete,
  onViewSubmissions,
}: {
  item: Assignment
  currentUserId: string
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
  onViewSubmissions: () => void
}) {
  const rate =
    item.expectedCount > 0
      ? Math.min(100, Math.round((item.submissionCount / item.expectedCount) * 100))
      : 0
  const overdue = item.status === "PAST"

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold">{item.title}</h2>
              <Badge variant={overdue ? "outline" : "default"} className="text-[10px]">
                {overdue ? "Past" : "Active"}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {item.subject.code}
              </Badge>
              {item.allowLate && (
                <Badge variant="outline" className="text-[10px]">
                  Late OK
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              <CalendarClock className="mr-1 inline h-3 w-3" />
              Due {dayjs(item.dueDate).format("D MMM YYYY · h:mm A")}
              {" · "}
              <Users className="mr-1 inline h-3 w-3" />
              {item.sections.length > 0
                ? item.sections
                    .map((s) => `${s.className}·${s.name}`)
                    .slice(0, 3)
                    .join(", ") + (item.sections.length > 3 ? `, +${item.sections.length - 3}` : "")
                : "no sections"}
              {" · max "}
              {item.maxScore}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={onViewSubmissions}>
              View submissions
            </Button>
            {canEdit && (
              <>
                <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onDelete}
                  aria-label="Delete"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {item.description && (
          <p className="text-sm text-muted-foreground">{item.description}</p>
        )}

        {item.instructionsMd && (
          <RichBody html={renderMarkdown(item.instructionsMd)} className="text-sm" />
        )}

        {item.attachments && item.attachments.length > 0 && (
          <ul className="flex flex-wrap gap-2 text-xs">
            {item.attachments.map((a, i) => (
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

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {item.submissionCount} of {item.expectedCount || "?"} submitted
            </span>
            <span>{item.expectedCount ? `${rate}%` : ""}</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${rate}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StudentAssignmentGroups({ items }: { items: Assignment[] }) {
  const groups = useMemo(() => {
    const now = Date.now()
    const dueSoon: Assignment[] = []
    const thisWeek: Assignment[] = []
    const pastDue: Assignment[] = []
    const graded: Assignment[] = []
    for (const a of items) {
      if (a.mine?.graded) {
        graded.push(a)
        continue
      }
      const due = new Date(a.dueDate).getTime()
      const diff = due - now
      if (diff < 0) pastDue.push(a)
      else if (diff <= 48 * 60 * 60 * 1000) dueSoon.push(a)
      else if (diff <= 7 * 24 * 60 * 60 * 1000) thisWeek.push(a)
      else thisWeek.push(a)
    }
    return [
      { label: "Due soon (next 48h)", items: dueSoon },
      { label: "This week", items: thisWeek },
      { label: "Past due", items: pastDue },
      { label: "Graded", items: graded },
    ].filter((g) => g.items.length > 0)
  }, [items])

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.label} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{g.label}</h2>
          <ul className="space-y-2">
            {g.items.map((a) => (
              <li key={a.id}>
                <StudentAssignmentCard item={a} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function StudentAssignmentCard({ item }: { item: Assignment }) {
  const submitted = !!item.mine
  const graded = !!item.mine?.graded

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold">{item.title}</h3>
              <Badge variant="secondary" className="text-[10px]">
                {item.subject.code}
              </Badge>
              {graded ? (
                <Badge className="text-[10px]">Graded</Badge>
              ) : submitted ? (
                <Badge variant="outline" className="text-[10px]">
                  Submitted
                </Badge>
              ) : item.status === "PAST" ? (
                <Badge variant="outline" className="text-[10px] text-destructive">
                  Overdue
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  Pending
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Due {dayjs(item.dueDate).format("D MMM YYYY · h:mm A")} · max {item.maxScore}
              {graded && item.mine?.score !== null
                ? ` · scored ${item.mine?.score}`
                : ""}
            </p>
          </div>
          {!submitted && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/dashboard/assignments/${item.id}`}>Open</a>
            </Button>
          )}
        </div>
        {item.instructionsMd && (
          <RichBody html={renderMarkdown(item.instructionsMd)} className="text-sm" />
        )}
      </CardContent>
    </Card>
  )
}
