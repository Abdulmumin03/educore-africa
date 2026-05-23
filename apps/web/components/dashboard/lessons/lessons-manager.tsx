"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import {
  BookOpenText,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Share2,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LessonDialog } from "@/components/dashboard/lessons/lesson-dialog"

type ClassOpt = {
  id: string
  name: string
  sections: { id: string; name: string }[]
}
type SubjectOpt = { id: string; name: string; code: string }

export type LessonListItem = {
  id: string
  date: string
  durationMin: number
  topic: string
  subtopic: string | null
  methodology: "LECTURE" | "DISCUSSION" | "PRACTICAL" | "MIXED"
  isShared: boolean
  parentId: string | null
  subject: { id: string; name: string; code: string }
  class: { id: string; name: string }
  section: { id: string; name: string } | null
  author: { id: string; firstName: string; lastName: string }
  isMine: boolean
}

type Scope = "mine" | "shared" | "all"

export function LessonsManager({
  classes,
  subjects,
  aiConfigured,
}: {
  classes: ClassOpt[]
  subjects: SubjectOpt[]
  aiConfigured: boolean
}) {
  const qc = useQueryClient()
  const [scope, setScope] = useState<Scope>("mine")
  const [composeOpen, setComposeOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const list = useQuery<{ items: LessonListItem[] }>({
    queryKey: ["lessons", scope],
    queryFn: async () => {
      const res = await fetch(`/api/lessons?scope=${scope}`)
      if (!res.ok) throw new Error("Failed to load lessons")
      return res.json()
    },
  })

  const duplicate = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/lessons/${id}/duplicate`, { method: "POST" })
      const b = (await res.json().catch(() => ({}))) as { id?: string; error?: string }
      if (!res.ok) throw new Error(b.error ?? "Duplicate failed")
      return b.id ?? null
    },
    onSuccess: (newId) => {
      toast.success("Duplicated — open the copy to edit")
      qc.invalidateQueries({ queryKey: ["lessons"] })
      if (newId) setEditing(newId)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/lessons/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? "Delete failed")
      }
    },
    onSuccess: () => {
      toast.success("Lesson plan deleted")
      qc.invalidateQueries({ queryKey: ["lessons"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const items = list.data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lesson plans</h1>
          <p className="text-sm text-muted-foreground">
            Draft, refine, and reuse plans. Mark plans as shared to publish into the school library.
          </p>
        </div>
        <Button onClick={() => setComposeOpen(true)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New lesson plan
        </Button>
      </div>

      <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
        <TabsList>
          <TabsTrigger value="mine">My plans</TabsTrigger>
          <TabsTrigger value="shared">Shared library</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {list.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <BookOpenText className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">No lesson plans here yet</p>
            <p className="text-xs text-muted-foreground">
              {scope === "shared"
                ? "No teacher has shared a plan with the school library yet."
                : "Draft one from scratch or use AI Auto-fill to get a head start."}
            </p>
            {scope !== "shared" && (
              <Button size="sm" className="mt-2" onClick={() => setComposeOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                New lesson plan
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((lp) => (
            <li key={lp.id}>
              <LessonCard
                item={lp}
                onOpen={() => setEditing(lp.id)}
                onDuplicate={() => duplicate.mutate(lp.id)}
                onDelete={() => {
                  if (typeof window !== "undefined" && !window.confirm(`Delete "${lp.topic}"?`)) return
                  remove.mutate(lp.id)
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {composeOpen && (
        <LessonDialog
          mode="create"
          classes={classes}
          subjects={subjects}
          open={composeOpen}
          aiConfigured={aiConfigured}
          onClose={() => setComposeOpen(false)}
          onSaved={() => {
            setComposeOpen(false)
            qc.invalidateQueries({ queryKey: ["lessons"] })
          }}
        />
      )}
      {editing && (
        <LessonDialog
          mode="edit"
          lessonId={editing}
          classes={classes}
          subjects={subjects}
          open={!!editing}
          aiConfigured={aiConfigured}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            qc.invalidateQueries({ queryKey: ["lessons"] })
          }}
        />
      )}
    </div>
  )
}

function LessonCard({
  item,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  item: LessonListItem
  onOpen: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">{item.topic}</h2>
            {item.subtopic && (
              <p className="truncate text-xs text-muted-foreground">{item.subtopic}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={onOpen} aria-label="Open">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onDuplicate} aria-label="Duplicate">
              <Copy className="h-4 w-4" />
            </Button>
            {item.isMine && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDelete}
                aria-label="Delete"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {item.subject.code}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {item.class.name}
            {item.section ? ` · Arm ${item.section.name}` : ""}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {item.methodology.charAt(0) + item.methodology.slice(1).toLowerCase()}
          </Badge>
          {item.isShared && (
            <Badge variant="outline" className="text-[10px]">
              <Share2 className="mr-1 h-3 w-3" />
              Shared
            </Badge>
          )}
          {item.parentId && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              <ShieldCheck className="mr-1 h-3 w-3" />
              Copy
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {dayjs(item.date).format("D MMM YYYY")} · {item.durationMin} min · by{" "}
          {item.author.firstName} {item.author.lastName}
        </p>
      </CardContent>
    </Card>
  )
}
