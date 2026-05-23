"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { ImagePlus, Loader2, X } from "lucide-react"
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
import type { LibraryBook } from "@/components/dashboard/library/library-manager"

const ANY_SUBJECT = "ANY"

type SubjectOpt = { id: string; name: string; code: string }

type FormState = {
  title: string
  author: string
  isbn: string
  category: string
  subjectId: string
  publisher: string
  year: string
  description: string
  coverUrl: string | null
  totalCopies: number
}

function buildInitial(initial?: LibraryBook): FormState {
  if (!initial) {
    return {
      title: "",
      author: "",
      isbn: "",
      category: "",
      subjectId: ANY_SUBJECT,
      publisher: "",
      year: "",
      description: "",
      coverUrl: null,
      totalCopies: 1,
    }
  }
  return {
    title: initial.title,
    author: initial.author ?? "",
    isbn: initial.isbn ?? "",
    category: initial.category ?? "",
    subjectId: initial.subject?.id ?? ANY_SUBJECT,
    publisher: initial.publisher ?? "",
    year: initial.year ? String(initial.year) : "",
    description: initial.description ?? "",
    coverUrl: initial.coverUrl,
    totalCopies: initial.totalCopies,
  }
}

export function AddBookDialog({
  mode,
  initial,
  subjects,
  open,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit"
  initial?: LibraryBook
  subjects: SubjectOpt[]
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(() => buildInitial(initial))
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) setForm(buildInitial(initial))
  }, [open, initial])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }))
  }

  async function pickCover(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Cover must be under 2 MB")
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
          scope: "books",
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
      update("coverUrl", publicUrl)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        author: form.author.trim() || undefined,
        isbn: form.isbn.trim() || undefined,
        category: form.category.trim() || undefined,
        subjectId: form.subjectId === ANY_SUBJECT ? null : form.subjectId,
        publisher: form.publisher.trim() || undefined,
        year: form.year ? Number(form.year) : undefined,
        description: form.description.trim() || undefined,
        coverUrl: form.coverUrl,
        totalCopies: form.totalCopies,
      }
      const url = mode === "edit" && initial
        ? `/api/library/books/${initial.id}`
        : "/api/library/books"
      const res = await fetch(url, {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Save failed")
    },
    onSuccess: () => {
      toast.success(mode === "edit" ? "Saved" : "Book added")
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const canSave = form.title.trim().length >= 2 && form.totalCopies >= 1 && !save.isPending && !uploading

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit book" : "Add book"}</DialogTitle>
          <DialogDescription>
            ISBN must be unique within the library. Total copies adjusts available stock.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
            <div className="space-y-1.5">
              <Label className="text-xs">Cover</Label>
              <div className="aspect-[3/4] overflow-hidden rounded-md border bg-muted">
                {form.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.coverUrl} alt="Cover" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImagePlus className="h-6 w-6" />
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void pickCover(f)
                  e.target.value = ""
                }}
              />
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex-1"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Upload"}
                </Button>
                {form.coverUrl && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => update("coverUrl", null)}
                    aria-label="Remove cover"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <Field label="Title">
                <Input
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder="e.g. Things Fall Apart"
                  maxLength={200}
                />
              </Field>
              <Field label="Author">
                <Input
                  value={form.author}
                  onChange={(e) => update("author", e.target.value)}
                  placeholder="e.g. Chinua Achebe"
                  maxLength={120}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ISBN">
                  <Input
                    value={form.isbn}
                    onChange={(e) => update("isbn", e.target.value)}
                    placeholder="e.g. 9780435905255"
                    maxLength={40}
                  />
                </Field>
                <Field label="Total copies">
                  <Input
                    type="number"
                    min={1}
                    value={form.totalCopies}
                    onChange={(e) =>
                      update("totalCopies", Math.max(1, Number(e.target.value) || 1))
                    }
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Category">
              <Input
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                placeholder="e.g. Fiction, Reference"
                maxLength={60}
              />
            </Field>
            <Field label="Subject (optional)">
              <Select value={form.subjectId} onValueChange={(v) => update("subjectId", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_SUBJECT}>None</SelectItem>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Year">
              <Input
                type="number"
                min={1500}
                max={new Date().getFullYear() + 1}
                value={form.year}
                onChange={(e) => update("year", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Publisher">
            <Input
              value={form.publisher}
              onChange={(e) => update("publisher", e.target.value)}
              maxLength={120}
            />
          </Field>

          <Field label="Description">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              maxLength={2000}
              placeholder="Short blurb about the book."
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSave}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {mode === "edit" ? "Save" : "Add book"}
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
