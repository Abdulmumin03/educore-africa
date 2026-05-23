"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import {
  AlertTriangle,
  CalendarClock,
  Eye,
  Loader2,
  Megaphone,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RichBody } from "@/components/dashboard/announcements/rich-body"
import { RichEditor } from "@/components/dashboard/announcements/rich-editor"

type Audience = "ALL" | "STUDENTS" | "PARENTS" | "STAFF" | "CLASS" | "SECTION"
type Priority = "NORMAL" | "IMPORTANT" | "URGENT"
type Channel = "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP" | "PUSH"
type Attachment = { url: string; name: string; size: number; type: string }

type ClassOpt = {
  id: string
  name: string
  sections: { id: string; name: string }[]
}

type Item = {
  id: string
  title: string
  body: string
  bodyHtml: string
  audience: Audience
  priority: Priority
  channels: Channel[]
  attachments: Attachment[]
  classId: string | null
  sectionId: string | null
  className: string | null
  sectionName: string | null
  publishedAt: string | null
  expiresAt: string | null
  createdAt: string
  authorId: string | null
  authorName: string | null
  readCount: number
}

const AUDIENCE_LABEL: Record<Audience, string> = {
  ALL: "Everyone",
  STUDENTS: "Students",
  PARENTS: "Parents",
  STAFF: "Staff",
  CLASS: "Class",
  SECTION: "Arm",
}

function audienceVariant(a: Audience): "default" | "secondary" | "outline" {
  switch (a) {
    case "ALL":
      return "default"
    case "STAFF":
      return "secondary"
    default:
      return "outline"
  }
}

const PRIORITY_LABEL: Record<Priority, string> = {
  NORMAL: "Normal",
  IMPORTANT: "Important",
  URGENT: "Urgent",
}

const PRIORITY_STYLE: Record<Priority, string> = {
  NORMAL: "bg-muted text-muted-foreground",
  IMPORTANT: "bg-amber-100 text-amber-800",
  URGENT: "bg-red-100 text-red-800",
}

const CHANNEL_OPTIONS: { value: Channel; label: string }[] = [
  { value: "IN_APP", label: "In-app" },
  { value: "EMAIL", label: "Email" },
  { value: "SMS", label: "SMS" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "PUSH", label: "Push" },
]

export function AnnouncementsManager({
  currentUserId,
  isPrivileged,
  classes,
  items,
}: {
  currentUserId: string
  isPrivileged: boolean
  classes: ClassOpt[]
  items: Item[]
}) {
  const [composeOpen, setComposeOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Announcements</h1>
          <p className="text-sm text-muted-foreground">
            Broadcast school updates to staff, parents, students, or a specific class.
            Rich text — bold, italic, lists, links.
          </p>
        </div>
        <Button onClick={() => setComposeOpen(true)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New announcement
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <Megaphone className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">No announcements yet</p>
            <p className="text-xs text-muted-foreground">
              Compose your first one to reach families and staff.
            </p>
            <Button size="sm" className="mt-2" onClick={() => setComposeOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New announcement
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <AnnouncementRow
              key={a.id}
              item={a}
              canEdit={isPrivileged || a.authorId === currentUserId}
              canDelete={isPrivileged || a.authorId === currentUserId}
              onEdit={() => setEditing(a)}
            />
          ))}
        </ul>
      )}

      <ComposeDialog
        mode="create"
        open={composeOpen}
        onOpenChange={setComposeOpen}
        classes={classes}
      />

      {editing && (
        <ComposeDialog
          mode="edit"
          initial={editing}
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          classes={classes}
        />
      )}
    </div>
  )
}

function AnnouncementRow({
  item,
  canEdit,
  canDelete,
  onEdit,
}: {
  item: Item
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
}) {
  const router = useRouter()
  const now = Date.now()
  const isScheduled = item.publishedAt && new Date(item.publishedAt).getTime() > now
  const isExpired = item.expiresAt && new Date(item.expiresAt).getTime() < now

  const remove = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/announcements/${item.id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? "Couldn't delete")
      }
    },
    onSuccess: () => {
      toast.success("Announcement deleted")
      router.refresh()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const scopeLabel =
    item.audience === "CLASS" && item.className
      ? item.className
      : item.audience === "SECTION" && item.sectionName
        ? `Arm ${item.sectionName}`
        : null

  return (
    <li>
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-semibold">{item.title}</h2>
                {item.priority !== "NORMAL" && (
                  <Badge variant="outline" className={`text-[10px] ${PRIORITY_STYLE[item.priority]}`}>
                    {item.priority === "URGENT" && <AlertTriangle className="mr-1 h-3 w-3" />}
                    {PRIORITY_LABEL[item.priority]}
                  </Badge>
                )}
                <Badge variant={audienceVariant(item.audience)} className="text-[10px]">
                  {AUDIENCE_LABEL[item.audience]}
                  {scopeLabel ? ` · ${scopeLabel}` : ""}
                </Badge>
                {item.channels.length > 0 && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    {item.channels.map((c) => c.replace("_", "").toLowerCase()).join(" · ")}
                  </Badge>
                )}
                {isScheduled && (
                  <Badge variant="outline" className="text-[10px]">
                    <CalendarClock className="mr-1 h-3 w-3" />
                    Scheduled
                  </Badge>
                )}
                {isExpired && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Expired
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {dayjs(item.publishedAt ?? item.createdAt).format("D MMM YYYY · h:mm A")}
                {item.authorName ? ` · ${item.authorName}` : ""}
                {item.expiresAt
                  ? ` · expires ${dayjs(item.expiresAt).format("D MMM YYYY")}`
                  : ""}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <ReadCount item={item} />
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onEdit}
                  aria-label="Edit announcement"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    if (
                      typeof window !== "undefined" &&
                      !window.confirm("Delete this announcement?")
                    ) {
                      return
                    }
                    remove.mutate()
                  }}
                  disabled={remove.isPending}
                  aria-label="Delete announcement"
                >
                  {remove.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
          <RichBody html={item.bodyHtml} />
          {item.attachments.length > 0 && (
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
        </CardContent>
      </Card>
    </li>
  )
}

function ReadCount({ item }: { item: Item }) {
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useQuery<{
    count: number
    readers: { name: string; role: string; readAt: string }[]
  }>({
    queryKey: ["announcement-reads", item.id],
    queryFn: async () => {
      const res = await fetch(`/api/announcements/${item.id}/reads`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: open,
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
        >
          <Eye className="h-3.5 w-3.5" />
          {item.readCount.toLocaleString()}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="text-sm font-semibold">Read receipts</p>
        <p className="text-xs text-muted-foreground">
          {(data?.count ?? item.readCount).toLocaleString()} people marked as read.
        </p>
        <div className="mt-2 max-h-56 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : !data || data.readers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No one has read it yet.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {data.readers.map((r, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="truncate">
                    {r.name}{" "}
                    <span className="text-muted-foreground">
                      · {r.role[0] + r.role.slice(1).toLowerCase().replace("_", " ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {dayjs(r.readAt).format("D MMM, HH:mm")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

type FormState = {
  title: string
  body: string
  audience: Audience
  priority: Priority
  channels: Channel[]
  attachments: Attachment[]
  classId: string
  sectionId: string
  publishedAt: string
  expiresAt: string
}

const EMPTY_FORM: FormState = {
  title: "",
  body: "",
  audience: "ALL",
  priority: "NORMAL",
  channels: [],
  attachments: [],
  classId: "",
  sectionId: "",
  publishedAt: "",
  expiresAt: "",
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  // Convert to local timezone string "YYYY-MM-DDTHH:mm" the input expects.
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function initialFromItem(item: Item): FormState {
  return {
    title: item.title,
    body: item.body,
    audience: item.audience,
    priority: item.priority,
    channels: item.channels,
    attachments: item.attachments,
    classId: item.classId ?? "",
    sectionId: item.sectionId ?? "",
    publishedAt: toLocalInputValue(item.publishedAt),
    expiresAt: toLocalInputValue(item.expiresAt),
  }
}

function ComposeDialog({
  mode,
  initial,
  open,
  onOpenChange,
  classes,
}: {
  mode: "create" | "edit"
  initial?: Item
  open: boolean
  onOpenChange: (v: boolean) => void
  classes: ClassOpt[]
}) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(() =>
    initial ? initialFromItem(initial) : EMPTY_FORM,
  )
  const [renotify, setRenotify] = useState(false)

  const sectionsForClass = useMemo(
    () => classes.find((c) => c.id === form.classId)?.sections ?? [],
    [classes, form.classId],
  )

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function reset() {
    setForm(initial ? initialFromItem(initial) : EMPTY_FORM)
    setRenotify(false)
  }

  const submit = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        body: form.body.trim(),
        audience: form.audience,
        priority: form.priority,
        channels: form.channels,
        attachments: form.attachments,
      }
      if (form.audience === "CLASS") payload.classId = form.classId
      if (form.audience === "SECTION") payload.sectionId = form.sectionId
      if (form.publishedAt) payload.publishedAt = new Date(form.publishedAt).toISOString()
      if (form.expiresAt) payload.expiresAt = new Date(form.expiresAt).toISOString()
      if (mode === "edit" && renotify) payload.renotify = true

      const url = mode === "edit" && initial ? `/api/announcements/${initial.id}` : "/api/announcements"
      const method = mode === "edit" ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? "Couldn't save")
      }
      return res.json()
    },
    onSuccess: (data: { dispatch?: { recipients?: number; capped?: boolean } | null; scheduled?: boolean }) => {
      if (mode === "edit") {
        if (data?.dispatch?.recipients) {
          toast.success(
            `Updated and re-notified ${data.dispatch.recipients} people${data.dispatch.capped ? " (capped)" : ""}`,
          )
        } else {
          toast.success("Announcement updated")
        }
      } else if (data?.scheduled) {
        toast.success("Scheduled — will dispatch at publish time")
      } else if (data?.dispatch?.recipients) {
        toast.success(
          `Published to ${data.dispatch.recipients} people${data.dispatch.capped ? " (capped)" : ""}`,
        )
      } else {
        toast.success("Published")
      }
      reset()
      onOpenChange(false)
      router.refresh()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  const titleOk = form.title.trim().length >= 2
  const bodyOk = form.body.trim().length >= 2
  const scopeOk =
    (form.audience !== "CLASS" || !!form.classId) &&
    (form.audience !== "SECTION" || !!form.sectionId)
  const datesOk =
    !form.publishedAt ||
    !form.expiresAt ||
    new Date(form.expiresAt).getTime() > new Date(form.publishedAt).getTime()
  const canSubmit = titleOk && bodyOk && scopeOk && datesOk && !submit.isPending

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Edit announcement" : "New announcement"}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Editing won't re-send notifications unless you tick the box below."
              : "Compose your announcement and pick how it should fan out."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="Mid-term break begins Monday"
              maxLength={140}
            />
          </Field>

          <Field label="Message">
            <RichEditor
              value={form.body}
              onChange={(md) => update("body", md.slice(0, 4000))}
              maxLength={4000}
              placeholder="Use the toolbar for headings, lists, and links."
            />
          </Field>

          <Field label="Attachments">
            <AttachmentField
              attachments={form.attachments}
              onChange={(next) => update("attachments", next)}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Priority">
              <Select value={form.priority} onValueChange={(v) => update("priority", v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="IMPORTANT">Important — pinned higher</SelectItem>
                  <SelectItem value="URGENT">Urgent — top of feed, red tag</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Send via">
              <div className="flex flex-wrap gap-2">
                {CHANNEL_OPTIONS.map((c) => {
                  const checked = form.channels.includes(c.value)
                  return (
                    <label
                      key={c.value}
                      className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs ${checked ? "border-primary bg-primary/10" : "border-input"}`}
                    >
                      <input
                        type="checkbox"
                        className="h-3 w-3"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...form.channels, c.value]
                            : form.channels.filter((x) => x !== c.value)
                          update("channels", next)
                        }}
                      />
                      {c.label}
                    </label>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Leave empty to fan out via everyone&apos;s preferences (legacy behaviour).
              </p>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Audience">
              <Select
                value={form.audience}
                onValueChange={(v) => {
                  const audience = v as Audience
                  update("audience", audience)
                  if (audience !== "CLASS" && audience !== "SECTION") {
                    update("classId", "")
                    update("sectionId", "")
                  }
                  if (audience === "CLASS") update("sectionId", "")
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Everyone in the school</SelectItem>
                  <SelectItem value="STUDENTS">Students only</SelectItem>
                  <SelectItem value="PARENTS">Parents only</SelectItem>
                  <SelectItem value="STAFF">Staff only</SelectItem>
                  <SelectItem value="CLASS">Specific class</SelectItem>
                  <SelectItem value="SECTION">Specific arm</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {(form.audience === "CLASS" || form.audience === "SECTION") && (
              <Field label="Class">
                <Select
                  value={form.classId}
                  onValueChange={(v) => {
                    update("classId", v)
                    update("sectionId", "")
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a class" />
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
            )}

            {form.audience === "SECTION" && (
              <Field label="Arm">
                <Select
                  value={form.sectionId}
                  onValueChange={(v) => update("sectionId", v)}
                  disabled={!form.classId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={form.classId ? "Pick an arm" : "Pick a class first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {sectionsForClass.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        Arm {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Publish at (optional)">
              <Input
                type="datetime-local"
                value={form.publishedAt}
                onChange={(e) => update("publishedAt", e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Defaults to now if left blank. Scheduling skips immediate dispatch.
              </p>
            </Field>
            <Field label="Expires (optional)">
              <Input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => update("expiresAt", e.target.value)}
              />
              {!datesOk && (
                <p className="text-[11px] text-destructive">Expiry must come after publish time.</p>
              )}
            </Field>
          </div>

          {mode === "edit" && (
            <label className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={renotify}
                onChange={(e) => setRenotify(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span>
                <span className="font-medium">Resend notification to subscribers</span>
                <span className="block text-xs text-muted-foreground">
                  Re-broadcasts via in-app, email, SMS, and any enabled channels. Recipients
                  who already got the original will see it again.
                </span>
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submit.isPending}>
            Cancel
          </Button>
          <Button onClick={() => submit.mutate()} disabled={!canSubmit}>
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "edit" ? "Save changes" : "Publish"}
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
          scope: "announcements",
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
        {uploading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Paperclip className="mr-1 h-3 w-3" />}
        {attachments.length === 0 ? "Add attachment" : "Add another"}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        PDFs or images, max 10 MB each.
      </p>
    </div>
  )
}
