"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import {
  CloudDownload,
  CloudOff,
  Download,
  FileAudio,
  FileImage,
  FileText,
  Film,
  Library,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UploadResourceDialog } from "@/components/dashboard/resources/upload-dialog"
import { ResourcePreviewDialog } from "@/components/dashboard/resources/preview-dialog"
import {
  CAP_BYTES,
  getOffline,
  listOffline,
  pruneOlderThan,
  removeOffline,
  saveOffline,
  totalBytes,
  type CacheEntry,
} from "@/lib/offline-cache"
import { cn } from "@/lib/utils"

type SubjectOpt = { id: string; name: string; code: string }

export type Resource = {
  id: string
  title: string
  description: string | null
  kind: "PDF" | "VIDEO" | "IMAGE" | "AUDIO"
  url: string
  mimeType: string | null
  sizeBytes: number | null
  subject: { id: string; name: string; code: string } | null
  classLevel: number | null
  tags: string[]
  downloadCount: number
  uploader: { firstName: string; lastName: string }
  youtubeId: string | null
  createdAt: string
}

type Tab = "all" | "offline"

const KIND_FILTERS: { value: string; label: string }[] = [
  { value: "ALL", label: "All types" },
  { value: "PDF", label: "PDFs" },
  { value: "VIDEO", label: "Videos" },
  { value: "IMAGE", label: "Images" },
  { value: "AUDIO", label: "Audio" },
]

const CLASS_LEVELS: { value: string; label: string }[] = [
  { value: "ALL", label: "All levels" },
  { value: "7", label: "JSS 1" },
  { value: "8", label: "JSS 2" },
  { value: "9", label: "JSS 3" },
  { value: "10", label: "SS 1" },
  { value: "11", label: "SS 2" },
  { value: "12", label: "SS 3" },
]

export function ResourceLibrary({
  canUpload,
  subjects,
}: {
  canUpload: boolean
  subjects: SubjectOpt[]
}) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>("all")
  const [q, setQ] = useState("")
  const [kind, setKind] = useState<string>("ALL")
  const [subjectId, setSubjectId] = useState<string>("ALL")
  const [classLevel, setClassLevel] = useState<string>("ALL")
  const [uploadOpen, setUploadOpen] = useState(false)
  const [previewing, setPreviewing] = useState<Resource | null>(null)
  const [offlineMeta, setOfflineMeta] = useState<{ used: number; entries: CacheEntry[] }>({
    used: 0,
    entries: [],
  })

  async function refreshOffline() {
    const [entries, used] = await Promise.all([listOffline(), totalBytes()])
    setOfflineMeta({ entries, used })
  }

  useEffect(() => {
    void refreshOffline()
  }, [])

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    if (q.trim()) p.set("q", q.trim())
    if (kind !== "ALL") p.set("kind", kind)
    if (subjectId !== "ALL") p.set("subjectId", subjectId)
    if (classLevel !== "ALL") p.set("classLevel", classLevel)
    return p.toString()
  }, [q, kind, subjectId, classLevel])

  const list = useQuery<{ items: Resource[] }>({
    queryKey: ["resources", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/resources?${queryString}`)
      if (!res.ok) throw new Error("Failed to load resources")
      return res.json()
    },
    enabled: tab === "all",
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/resources/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? "Delete failed")
      }
    },
    onSuccess: () => {
      toast.success("Resource removed")
      qc.invalidateQueries({ queryKey: ["resources"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const items = list.data?.items ?? []
  const offlineIds = new Set(offlineMeta.entries.map((e) => e.id))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Resources</h1>
          <p className="text-sm text-muted-foreground">
            Files, videos, and study materials. Save what you need offline (200 MB cap).
          </p>
        </div>
        {canUpload && (
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Upload resource
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="all">Library</TabsTrigger>
          <TabsTrigger value="offline">
            Offline
            {offlineMeta.entries.length > 0 && (
              <Badge variant="outline" className="ml-1.5 text-[10px]">
                {offlineMeta.entries.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "all" ? (
        <>
          <Card>
            <CardContent className="grid gap-3 p-3 sm:grid-cols-[1fr_140px_180px_140px]">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by title…"
                  className="pl-8"
                />
              </div>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KIND_FILTERS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger><SelectValue placeholder="All subjects" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All subjects</SelectItem>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={classLevel} onValueChange={setClassLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASS_LEVELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {list.isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </CardContent>
            </Card>
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
                <Library className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium">No resources match these filters</p>
              </CardContent>
            </Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((r) => (
                <li key={r.id}>
                  <ResourceCard
                    item={r}
                    canDelete={canUpload}
                    cached={offlineIds.has(r.id)}
                    onPreview={() => setPreviewing(r)}
                    onDelete={() => {
                      if (typeof window !== "undefined" && !window.confirm(`Delete "${r.title}"?`)) return
                      remove.mutate(r.id)
                    }}
                    onSaveOffline={() => refreshOffline()}
                    onRemoveOffline={() => refreshOffline()}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <OfflineTab
          entries={offlineMeta.entries}
          used={offlineMeta.used}
          onChange={refreshOffline}
        />
      )}

      {uploadOpen && (
        <UploadResourceDialog
          subjects={subjects}
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onSaved={() => {
            setUploadOpen(false)
            qc.invalidateQueries({ queryKey: ["resources"] })
          }}
        />
      )}

      <ResourcePreviewDialog
        resource={previewing}
        open={!!previewing}
        onClose={() => setPreviewing(null)}
        onOpenExternal={() => {
          if (previewing) {
            void fetch(`/api/resources/${previewing.id}/download`, { method: "POST" }).catch(() => {})
          }
        }}
      />
    </div>
  )
}

function ResourceCard({
  item,
  canDelete,
  cached,
  onPreview,
  onDelete,
  onSaveOffline,
  onRemoveOffline,
}: {
  item: Resource
  canDelete: boolean
  cached: boolean
  onPreview: () => void
  onDelete: () => void
  onSaveOffline: () => void
  onRemoveOffline: () => void
}) {
  const [busy, setBusy] = useState<false | "save" | "remove" | "open">(false)

  async function bumpDownloadCounter() {
    void fetch(`/api/resources/${item.id}/download`, { method: "POST" }).catch(() => {})
  }

  async function handleSaveOffline() {
    if (item.kind === "VIDEO") {
      toast.error("YouTube videos can't be saved offline.")
      return
    }
    setBusy("save")
    try {
      const r = await saveOffline({ id: item.id, url: item.url, name: item.title })
      if (!r.ok) throw new Error(r.error)
      toast.success("Saved for offline")
      onSaveOffline()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveOffline() {
    setBusy("remove")
    try {
      await removeOffline(item.id)
      toast.success("Removed from offline cache")
      onRemoveOffline()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <button
          type="button"
          onClick={onPreview}
          className="block w-full cursor-pointer text-left"
          aria-label={`Preview ${item.title}`}
        >
          <KindThumbnail item={item} />
        </button>
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={onPreview}
            className="min-w-0 flex-1 cursor-pointer text-left hover:underline"
          >
            <h2 className="truncate font-semibold">{item.title}</h2>
            {item.description && (
              <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
            )}
          </button>
          {canDelete && (
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
        <div className="flex flex-wrap items-center gap-1.5">
          <KindBadge kind={item.kind} />
          {item.subject && (
            <Badge variant="secondary" className="text-[10px]">
              {item.subject.code}
            </Badge>
          )}
          {item.classLevel && (
            <Badge variant="outline" className="text-[10px]">
              {classLevelLabel(item.classLevel)}
            </Badge>
          )}
          {item.tags.slice(0, 3).map((t) => (
            <Badge key={t} variant="outline" className="text-[10px]">
              #{t}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          By {item.uploader.firstName} {item.uploader.lastName} ·{" "}
          {dayjs(item.createdAt).format("D MMM YYYY")} · {item.downloadCount} download
          {item.downloadCount === 1 ? "" : "s"}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            asChild
            onClick={bumpDownloadCounter}
            disabled={busy === "open"}
          >
            <a href={item.url} target="_blank" rel="noopener">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {item.kind === "VIDEO" ? "Watch" : "Open"}
            </a>
          </Button>
          {item.kind !== "VIDEO" && (
            <Button
              variant={cached ? "outline" : "ghost"}
              size="sm"
              onClick={cached ? handleRemoveOffline : handleSaveOffline}
              disabled={!!busy}
            >
              {busy === "save" || busy === "remove" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : cached ? (
                <CloudOff className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <CloudDownload className="mr-1.5 h-3.5 w-3.5" />
              )}
              {cached ? "Cached" : "Save offline"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function KindThumbnail({ item }: { item: Resource }) {
  if (item.kind === "VIDEO" && item.youtubeId) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-md bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://img.youtube.com/vi/${item.youtubeId}/hqdefault.jpg`}
          alt={item.title}
          className="h-full w-full object-cover"
        />
      </div>
    )
  }
  if (item.kind === "IMAGE") {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-md bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt={item.title} className="h-full w-full object-cover" />
      </div>
    )
  }
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-md bg-muted/40">
      <KindIcon kind={item.kind} className="h-10 w-10 text-muted-foreground" />
    </div>
  )
}

function KindIcon({
  kind,
  className,
}: {
  kind: Resource["kind"]
  className?: string
}) {
  switch (kind) {
    case "PDF":
      return <FileText className={className} />
    case "IMAGE":
      return <FileImage className={className} />
    case "AUDIO":
      return <FileAudio className={className} />
    case "VIDEO":
      return <Film className={className} />
  }
}

function KindBadge({ kind }: { kind: Resource["kind"] }) {
  return (
    <Badge variant="outline" className="gap-1 text-[10px]">
      <KindIcon kind={kind} className="h-3 w-3" />
      {kind}
    </Badge>
  )
}

function classLevelLabel(level: number): string {
  if (level >= 7 && level <= 9) return `JSS ${level - 6}`
  if (level >= 10 && level <= 12) return `SS ${level - 9}`
  return `Year ${level}`
}

const STALE_DAYS = 30

function OfflineTab({
  entries,
  used,
  onChange,
}: {
  entries: CacheEntry[]
  used: number
  onChange: () => void
}) {
  const pct = Math.min(100, Math.round((used / CAP_BYTES) * 100))

  // Background sweep: drop entries not accessed in 30+ days when the user
  // opens the Offline tab. Toast only when something was actually pruned so
  // the tab isn't noisy.
  useEffect(() => {
    void (async () => {
      const removed = await pruneOlderThan(STALE_DAYS)
      if (removed > 0) {
        toast.info(
          `Cleared ${removed} stale offline file${removed === 1 ? "" : "s"} (unused for ${STALE_DAYS}+ days).`,
        )
        onChange()
      }
    })()
    // Only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function open(entry: CacheEntry) {
    const fresh = await getOffline(entry.id)
    if (!fresh) {
      toast.error("Not found in cache anymore.")
      onChange()
      return
    }
    const objectUrl = URL.createObjectURL(fresh.blob)
    window.open(objectUrl, "_blank")
    // Revoke after a minute — long enough for the new tab to load.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  }

  async function remove(id: string) {
    await removeOffline(id)
    toast.success("Removed")
    onChange()
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Offline storage</span>
            <span>
              {humanBytes(used)} of {humanBytes(CAP_BYTES)} used ({pct}%)
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded bg-muted">
            <div
              className={cn(
                "h-full transition-all",
                pct > 90 ? "bg-amber-500" : "bg-primary",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Files are kept in your browser. Cleared automatically when oldest items are over the cap.
          </p>
        </CardContent>
      </Card>
      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <CloudOff className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nothing saved for offline yet.</p>
            <p className="text-xs text-muted-foreground">
              Open the Library tab and click &quot;Save offline&quot; on any PDF, image, or audio file.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id}>
              <Card>
                <CardContent className="flex items-center gap-3 p-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.name}</p>
                    <Label className="text-[11px] text-muted-foreground">
                      {humanBytes(e.sizeBytes)} · saved {dayjs(e.savedAt).format("D MMM, HH:mm")}
                    </Label>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => open(e)}>
                    Open
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(e.id)}
                    aria-label="Remove from offline"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
