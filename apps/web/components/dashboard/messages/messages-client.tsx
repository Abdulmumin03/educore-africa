"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import {
  CheckCheck,
  Languages,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Search,
  Send,
  Smile,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type ConversationPreview = {
  otherUserId: string
  otherUser: {
    id: string
    firstName: string
    lastName: string
    avatarUrl: string | null
    role: string
  }
  lastMessage: string
  lastSentByMe: boolean
  lastAt: string
  unreadCount: number
}

type ThreadMessage = {
  id: string
  senderId: string
  receiverId: string
  subject: string | null
  body: string
  attachments:
    | { url: string; name: string; size: number; type: string }[]
    | null
  attachmentUrl: string | null
  readAt: string | null
  createdAt: string
  sentByMe: boolean
}

type ThreadResponse = {
  other: {
    id: string
    firstName: string
    lastName: string
    avatarUrl: string | null
    role: string
    email: string
    phone: string | null
  }
  messages: ThreadMessage[]
}

type RecipientUser = {
  id: string
  firstName: string
  lastName: string
  role: string
  avatarUrl: string | null
  email: string
}

const EMOJIS = ["😀", "😅", "🙏", "👍", "👏", "🎉", "❤️", "🔥", "✅", "📚", "📝", "📞", "💯", "🤝", "👀", "🙌"]
const TRANSLATE_LANGS = ["Hausa", "Yoruba", "Igbo", "Pidgin", "Swahili", "French", "Arabic", "English"]

function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

export function MessagesClient({
  currentUserId,
  aiConfigured,
}: {
  currentUserId: string
  aiConfigured: boolean
}) {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [search, setSearch] = useState("")

  const conversations = useQuery<{ items: ConversationPreview[]; totalUnread: number }>({
    queryKey: ["messages-conversations"],
    queryFn: async () => {
      const res = await fetch("/api/messages")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    refetchInterval: 10_000,
  })

  const filtered = useMemo(() => {
    const items = conversations.data?.items ?? []
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter((c) =>
      `${c.otherUser.firstName} ${c.otherUser.lastName}`.toLowerCase().includes(q) ||
      c.lastMessage.toLowerCase().includes(q),
    )
  }, [conversations.data, search])

  // Default-select the first conversation when the list loads.
  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].otherUserId)
  }, [selectedId, filtered])

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
        <Button onClick={() => setComposeOpen(true)} size="sm">
          <MessageSquarePlus className="mr-1.5 h-4 w-4" />
          New message
        </Button>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden md:grid-cols-[320px_1fr]">
        <ConversationList
          items={filtered}
          loading={conversations.isLoading}
          search={search}
          onSearch={setSearch}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <ThreadPane
          otherUserId={selectedId}
          currentUserId={currentUserId}
          aiConfigured={aiConfigured}
          onSent={() => qc.invalidateQueries({ queryKey: ["messages-conversations"] })}
        />
      </div>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSent={(receiverId) => {
          setComposeOpen(false)
          setSelectedId(receiverId)
          qc.invalidateQueries({ queryKey: ["messages-conversations"] })
        }}
      />
    </div>
  )
}

function ConversationList({
  items,
  loading,
  search,
  onSearch,
  selectedId,
  onSelect,
}: {
  items: ConversationPreview[]
  loading: boolean
  search: string
  onSearch: (v: string) => void
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-md border bg-card">
      <div className="border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search conversations"
            className="pl-7 text-sm"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="p-4 text-sm italic text-muted-foreground">
            No conversations yet. Click &quot;New message&quot; to start one.
          </div>
        ) : (
          items.map((c) => (
            <button
              key={c.otherUserId}
              onClick={() => onSelect(c.otherUserId)}
              className={cn(
                "flex w-full items-start gap-2 border-b px-3 py-2 text-left transition hover:bg-muted/40",
                selectedId === c.otherUserId && "bg-muted/60",
              )}
            >
              <Avatar className="h-9 w-9 shrink-0">
                {c.otherUser.avatarUrl ? <AvatarImage src={c.otherUser.avatarUrl} alt="" /> : null}
                <AvatarFallback className="text-xs">
                  {initials(c.otherUser.firstName, c.otherUser.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">
                    {c.otherUser.firstName} {c.otherUser.lastName}
                  </p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {dayjs(c.lastAt).format("D MMM HH:mm")}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-muted-foreground">
                    {c.lastSentByMe ? "You: " : ""}
                    {c.lastMessage}
                  </p>
                  {c.unreadCount > 0 && (
                    <Badge variant="destructive" className="ml-2 text-[10px]">
                      {c.unreadCount}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function ThreadPane({
  otherUserId,
  currentUserId,
  aiConfigured,
  onSent,
}: {
  otherUserId: string | null
  currentUserId: string
  aiConfigured: boolean
  onSent: () => void
}) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState("")
  const [attachment, setAttachment] = useState<{
    url: string
    name: string
    size: number
    type: string
  } | null>(null)
  const [uploading, setUploading] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const thread = useQuery<ThreadResponse>({
    queryKey: ["messages-thread", otherUserId],
    queryFn: async () => {
      const res = await fetch(`/api/messages/${otherUserId}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: !!otherUserId,
    refetchInterval: 10_000,
  })

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [thread.data?.messages.length])

  const send = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          receiverId: otherUserId,
          body: draft,
          attachments: attachment ? [attachment] : undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? "Failed")
      return body
    },
    onSuccess: () => {
      setDraft("")
      setAttachment(null)
      qc.invalidateQueries({ queryKey: ["messages-thread", otherUserId] })
      onSent()
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
      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
          scope: "messages",
        }),
      })
      if (!presignRes.ok) {
        const e = (await presignRes.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Presign failed")
      }
      const { uploadUrl, publicUrl } = (await presignRes.json()) as {
        uploadUrl: string
        publicUrl: string
      }
      const put = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type },
      })
      if (!put.ok) throw new Error("Upload failed")
      setAttachment({ url: publicUrl, name: file.name, size: file.size, type: file.type })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  if (!otherUserId) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border bg-card p-8 text-sm text-muted-foreground">
        Select a conversation, or click &quot;New message&quot; to start one.
      </div>
    )
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-md border bg-card">
      {thread.data?.other && (
        <div className="flex items-center gap-2 border-b p-3">
          <Avatar className="h-9 w-9">
            {thread.data.other.avatarUrl ? <AvatarImage src={thread.data.other.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-xs">
              {initials(thread.data.other.firstName, thread.data.other.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-sm font-semibold">
              {thread.data.other.firstName} {thread.data.other.lastName}
            </p>
            <p className="text-[10px] uppercase text-muted-foreground">{thread.data.other.role}</p>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {thread.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : thread.data?.messages.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">No messages yet — say hi.</p>
        ) : (
          thread.data?.messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              isMine={m.senderId === currentUserId}
              aiConfigured={aiConfigured}
            />
          ))
        )}
      </div>

      <div className="border-t p-2">
        {attachment && (
          <div className="mb-2 flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-xs">
            <Paperclip className="h-3 w-3" />
            <span className="truncate flex-1">{attachment.name}</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setAttachment(null)}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-1">
          <Textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
            className="resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                if (draft.trim()) send.mutate()
              }
            }}
          />
          <div className="flex flex-col gap-1">
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
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" size="icon" variant="ghost">
                  <Smile className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56" align="end">
                <div className="grid grid-cols-8 gap-1">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="rounded p-1 text-lg hover:bg-muted"
                      onClick={() => setDraft((d) => d + e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              size="icon"
              onClick={() => send.mutate()}
              disabled={!draft.trim() || send.isPending}
            >
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  isMine,
  aiConfigured,
}: {
  message: ThreadMessage
  isMine: boolean
  aiConfigured: boolean
}) {
  const [translated, setTranslated] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)
  const [targetLang, setTargetLang] = useState("English")

  async function translate() {
    setTranslating(true)
    try {
      const res = await fetch("/api/messages/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: message.body, targetLanguage: targetLang }),
      })
      const body = (await res.json()) as { ok: boolean; translation?: string; error?: string }
      if (!body.ok || !body.translation) throw new Error(body.error ?? "Failed")
      setTranslated(body.translation)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Translation failed")
    } finally {
      setTranslating(false)
    }
  }

  const attachments = Array.isArray(message.attachments)
    ? message.attachments
    : message.attachmentUrl
      ? [{ url: message.attachmentUrl, name: "attachment", size: 0, type: "" }]
      : []

  return (
    <div className={cn("flex", isMine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          isMine
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted",
        )}
      >
        {message.subject && (
          <p className={cn("mb-1 text-xs font-semibold", isMine ? "opacity-90" : "text-muted-foreground")}>
            {message.subject}
          </p>
        )}
        <p className="whitespace-pre-wrap">{message.body}</p>
        {translated && (
          <p
            className={cn(
              "mt-2 border-t pt-1 text-xs italic",
              isMine ? "border-primary-foreground/30 opacity-90" : "border-muted-foreground/20 text-muted-foreground",
            )}
          >
            {translated}
          </p>
        )}
        {attachments.length > 0 && (
          <ul className="mt-2 space-y-1">
            {attachments.map((a, i) => (
              <li key={i}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener"
                  className={cn(
                    "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs underline",
                    isMine ? "bg-primary-foreground/10" : "bg-background",
                  )}
                >
                  <Paperclip className="h-3 w-3" />
                  {a.name}
                </a>
              </li>
            ))}
          </ul>
        )}
        <div
          className={cn(
            "mt-1 flex items-center gap-2 text-[10px]",
            isMine ? "justify-end opacity-80" : "text-muted-foreground",
          )}
        >
          {aiConfigured && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "inline-flex items-center gap-0.5 underline-offset-2 hover:underline",
                    isMine ? "text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  <Languages className="h-3 w-3" /> translate
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48" align={isMine ? "end" : "start"}>
                <Label className="text-xs">Target language</Label>
                <Select value={targetLang} onValueChange={setTargetLang}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRANSLATE_LANGS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="mt-2 w-full" onClick={translate} disabled={translating}>
                  {translating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                  Translate
                </Button>
              </PopoverContent>
            </Popover>
          )}
          <span>{dayjs(message.createdAt).format("HH:mm")}</span>
          {isMine && (
            <CheckCheck className={cn("h-3 w-3", message.readAt ? "text-emerald-300" : "opacity-60")} />
          )}
        </div>
      </div>
    </div>
  )
}

function ComposeModal({
  open,
  onClose,
  onSent,
}: {
  open: boolean
  onClose: () => void
  onSent: (receiverId: string) => void
}) {
  const [q, setQ] = useState("")
  const [roleFilter, setRoleFilter] = useState<string>("__all__")
  const [receiver, setReceiver] = useState<RecipientUser | null>(null)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")

  const recipients = useQuery<{ items: RecipientUser[]; roles: string[] }>({
    queryKey: ["messages-recipients", q, roleFilter],
    queryFn: async () => {
      const p = new URLSearchParams({ q })
      if (roleFilter !== "__all__") p.set("role", roleFilter)
      const res = await fetch(`/api/messages/recipients?${p}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: open,
  })

  const send = useMutation({
    mutationFn: async () => {
      if (!receiver) throw new Error("Pick a recipient")
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          receiverId: receiver.id,
          subject: subject || undefined,
          body,
        }),
      })
      const r = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(r.error ?? "Failed")
      return receiver.id
    },
    onSuccess: (id) => {
      toast.success("Message sent")
      onSent(id)
      setQ("")
      setReceiver(null)
      setSubject("")
      setBody("")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
          <DialogDescription>Direct message a user in your school.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
            <div>
              <Label className="text-xs">Recipient</Label>
              <Input
                placeholder="Search by name…"
                value={receiver ? `${receiver.firstName} ${receiver.lastName}` : q}
                onChange={(e) => {
                  setReceiver(null)
                  setQ(e.target.value)
                }}
              />
            </div>
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All roles</SelectItem>
                  {(recipients.data?.roles ?? []).map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!receiver && (recipients.data?.items.length ?? 0) > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-md border">
              {recipients.data!.items.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setReceiver(u)}
                    className="flex w-full items-center gap-2 border-b px-3 py-2 text-left hover:bg-muted/40"
                  >
                    <Avatar className="h-7 w-7">
                      {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt="" /> : null}
                      <AvatarFallback className="text-[10px]">
                        {initials(u.firstName, u.lastName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">
                      <span className="block font-medium">
                        {u.firstName} {u.lastName}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {u.role.replace(/_/g, " ")} · {u.email}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div>
            <Label className="text-xs">Subject (optional)</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Message</Label>
            <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!receiver || !body.trim() || send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
