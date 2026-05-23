"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Loader2, Paperclip, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { RichEditor } from "@/components/dashboard/announcements/rich-editor"
import type { Assignment } from "@/components/dashboard/assignments/assignments-manager"

type ClassOpt = {
  id: string
  name: string
  sections: { id: string; name: string }[]
}
type SubjectOpt = { id: string; name: string; code: string }
type Attachment = { url: string; name: string; size: number; type: string }

type FormState = {
  title: string
  subjectId: string
  sectionIds: string[]
  description: string
  instructionsMd: string
  dueDateLocal: string
  maxScore: number
  allowLate: boolean
  attachments: Attachment[]
}

function defaultDueLocal() {
  // tomorrow at 23:59 in local time
  const d = dayjs().add(1, "day").hour(23).minute(59).second(0)
  return d.format("YYYY-MM-DDTHH:mm")
}

function toLocalInput(iso: string) {
  return dayjs(iso).format("YYYY-MM-DDTHH:mm")
}

function buildInitial(initial: Assignment | undefined): FormState {
  if (!initial) {
    return {
      title: "",
      subjectId: "",
      sectionIds: [],
      description: "",
      instructionsMd: "",
      dueDateLocal: defaultDueLocal(),
      maxScore: 100,
      allowLate: false,
      attachments: [],
    }
  }
  return {
    title: initial.title,
    subjectId: initial.subject.id,
    sectionIds: initial.sectionIds,
    description: initial.description ?? "",
    instructionsMd: initial.instructionsMd ?? "",
    dueDateLocal: toLocalInput(initial.dueDate),
    maxScore: initial.maxScore,
    allowLate: initial.allowLate,
    attachments: initial.attachments ?? [],
  }
}

export function AssignmentDialog({
  mode,
  initial,
  classes,
  subjects,
  open,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit"
  initial?: Assignment
  classes: ClassOpt[]
  subjects: SubjectOpt[]
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(() => buildInitial(initial))

  useEffect(() => {
    if (open) setForm(buildInitial(initial))
  }, [open, initial])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }))
  }

  const submit = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        subjectId: form.subjectId,
        sectionIds: form.sectionIds,
        description: form.description.trim() || undefined,
        instructionsMd: form.instructionsMd.trim() || undefined,
        dueDate: new Date(form.dueDateLocal).toISOString(),
        maxScore: form.maxScore,
        allowLate: form.allowLate,
        attachments: form.attachments.length ? form.attachments : undefined,
      }
      const url = mode === "edit" && initial ? `/api/assignments/${initial.id}` : "/api/assignments"
      const method = mode === "edit" ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Save failed")
    },
    onSuccess: () => {
      toast.success(mode === "edit" ? "Updated" : "Created")
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const titleOk = form.title.trim().length >= 2
  const sectionsOk = form.sectionIds.length > 0
  const subjectOk = !!form.subjectId
  const dueOk = !!form.dueDateLocal
  const canSubmit = titleOk && sectionsOk && subjectOk && dueOk && !submit.isPending

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit assignment" : "New assignment"}</DialogTitle>
          <DialogDescription>
            Set what&apos;s due, when, and which sections receive it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="Algebra worksheet — chapter 4"
              maxLength={200}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Subject">
              <Select value={form.subjectId} onValueChange={(v) => update("subjectId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Due date / time">
              <Input
                type="datetime-local"
                value={form.dueDateLocal}
                onChange={(e) => update("dueDateLocal", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Sections">
            <SectionMultiSelect
              classes={classes}
              value={form.sectionIds}
              onChange={(v) => update("sectionIds", v)}
            />
          </Field>

          <Field label="Description (one-line, optional)">
            <Input
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Short summary shown in lists."
              maxLength={500}
            />
          </Field>

          <Field label="Instructions">
            <RichEditor
              value={form.instructionsMd}
              onChange={(md) => update("instructionsMd", md.slice(0, 8000))}
              maxLength={8000}
              placeholder="Use the toolbar for headings, lists, and links."
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Max score">
              <Input
                type="number"
                min={1}
                max={1000}
                value={form.maxScore}
                onChange={(e) => update("maxScore", Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Late submissions">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.allowLate}
                  onChange={(e) => update("allowLate", e.target.checked)}
                  className="h-4 w-4"
                />
                Allow students to submit after the due date
              </label>
            </Field>
          </div>

          <Field label="Attachments">
            <AttachmentField
              attachments={form.attachments}
              onChange={(a) => update("attachments", a)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submit.isPending}>
            Cancel
          </Button>
          <Button onClick={() => submit.mutate()} disabled={!canSubmit}>
            {submit.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {mode === "edit" ? "Save" : "Create"}
          </Button>
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

function SectionMultiSelect({
  classes,
  value,
  onChange,
}: {
  classes: ClassOpt[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  }
  return (
    <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border bg-background p-2">
      {classes.length === 0 && (
        <p className="text-xs text-muted-foreground">No classes set up yet.</p>
      )}
      {classes.map((c) => (
        <div key={c.id}>
          <div className="text-xs font-semibold text-muted-foreground">{c.name}</div>
          <div className="flex flex-wrap gap-1.5">
            {c.sections.map((s) => {
              const checked = value.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    checked ? "border-primary bg-primary/10 text-foreground" : "border-input"
                  }`}
                >
                  Arm {s.name}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function AttachmentField({
  attachments,
  onChange,
}: {
  attachments: Attachment[]
  onChange: (next: Attachment[]) => void
}) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  async function pick(file: File) {
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
      onChange([
        ...attachments,
        { url: publicUrl, name: file.name, size: file.size, type: file.type },
      ])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <li key={i} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs">
              <Paperclip className="h-3 w-3" />
              <span className="max-w-[180px] truncate">{a.name}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onChange(attachments.filter((_, j) => j !== i))}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void pick(f)
          e.target.value = ""
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || attachments.length >= 10}
      >
        {uploading ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <Paperclip className="mr-1 h-3 w-3" />
        )}
        {attachments.length === 0 ? "Add attachment" : "Add another"}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        PDFs or images, max 10 MB each.
      </p>
    </div>
  )
}
