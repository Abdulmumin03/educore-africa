"use client"

import { useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Loader2, Paperclip, Upload, X } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import { youtubeId } from "@/lib/youtube"

type SubjectOpt = { id: string; name: string; code: string }

type Kind = "PDF" | "VIDEO" | "IMAGE" | "AUDIO"

const KIND_OPTIONS: { value: Kind; label: string; accept: string }[] = [
  { value: "PDF", label: "PDF document", accept: "application/pdf" },
  { value: "IMAGE", label: "Image", accept: "image/*" },
  { value: "AUDIO", label: "Audio", accept: "audio/*" },
  { value: "VIDEO", label: "YouTube video", accept: "" },
]

const ANY_LEVEL = "ANY"
const ANY_SUBJECT = "ANY"

const CLASS_LEVELS = [
  { value: ANY_LEVEL, label: "Any level" },
  { value: "7", label: "JSS 1" },
  { value: "8", label: "JSS 2" },
  { value: "9", label: "JSS 3" },
  { value: "10", label: "SS 1" },
  { value: "11", label: "SS 2" },
  { value: "12", label: "SS 3" },
]

export function UploadResourceDialog({
  subjects,
  open,
  onClose,
  onSaved,
}: {
  subjects: SubjectOpt[]
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [kind, setKind] = useState<Kind>("PDF")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [subjectId, setSubjectId] = useState<string>(ANY_SUBJECT)
  const [classLevel, setClassLevel] = useState<string>(ANY_LEVEL)
  const [tagInput, setTagInput] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [uploadedFile, setUploadedFile] = useState<{
    url: string
    mime: string
    size: number
    name: string
  } | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function reset() {
    setKind("PDF")
    setTitle("")
    setDescription("")
    setSubjectId(ANY_SUBJECT)
    setClassLevel(ANY_LEVEL)
    setTagInput("")
    setTags([])
    setYoutubeUrl("")
    setUploadedFile(null)
  }

  function close() {
    reset()
    onClose()
  }

  const kindMeta = KIND_OPTIONS.find((k) => k.value === kind)!
  const isVideo = kind === "VIDEO"
  const ytId = isVideo ? youtubeId(youtubeUrl) : null

  async function pickFile(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Max 25 MB")
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
          scope: "resources",
        }),
      })
      if (!presign.ok) {
        const b = (await presign.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? "Upload not available")
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
      setUploadedFile({ url: publicUrl, mime: file.type, size: file.size, name: file.name })
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase()
    if (!t || tags.includes(t) || tags.length >= 20) return
    setTags([...tags, t])
    setTagInput("")
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || undefined,
        kind,
        subjectId: subjectId === ANY_SUBJECT ? null : subjectId,
        classLevel: classLevel === ANY_LEVEL ? null : Number(classLevel),
        tags,
      }
      if (isVideo) {
        if (!ytId) throw new Error("Paste a valid YouTube URL")
        payload.url = youtubeUrl.trim()
      } else {
        if (!uploadedFile) throw new Error("Upload a file first")
        payload.url = uploadedFile.url
        payload.mimeType = uploadedFile.mime
        payload.sizeBytes = uploadedFile.size
      }
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Save failed")
    },
    onSuccess: () => {
      toast.success("Resource uploaded")
      reset()
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const canSave =
    title.trim().length >= 2 &&
    !save.isPending &&
    !uploading &&
    (isVideo ? !!ytId : !!uploadedFile)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload resource</DialogTitle>
          <DialogDescription>
            Add a PDF, image, audio file, or paste a YouTube link to share with the school.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select
              value={kind}
              onValueChange={(v) => {
                setKind(v as Kind)
                setUploadedFile(null)
                setYoutubeUrl("")
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isVideo ? (
            <div className="space-y-1.5">
              <Label className="text-xs">YouTube URL</Label>
              <Input
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
              />
              {youtubeUrl && !ytId && (
                <p className="text-[11px] text-destructive">
                  Doesn&apos;t look like a YouTube link.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">File</Label>
              {uploadedFile ? (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
                  <Paperclip className="h-3 w-3" />
                  <span className="truncate flex-1">{uploadedFile.name}</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setUploadedFile(null)}
                    aria-label="Remove file"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={kindMeta.accept}
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
                    disabled={uploading}
                  >
                    {uploading ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Upload file
                  </Button>
                  <p className="text-[11px] text-muted-foreground">Max 25 MB.</p>
                </>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Quadratic equations — past questions"
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Short summary of what's in here."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Subject (optional)</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_SUBJECT}>Any subject</SelectItem>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Class level (optional)</Label>
              <Select value={classLevel} onValueChange={setClassLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASS_LEVELS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tags (optional)</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="e.g. revision"
                maxLength={40}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addTag()
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addTag}>
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <li
                    key={t}
                    className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs"
                  >
                    #{t}
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      aria-label="Remove tag"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={save.isPending || uploading}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSave}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
