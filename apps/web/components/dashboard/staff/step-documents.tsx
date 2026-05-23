"use client"

import { useRef, useState } from "react"
import { Loader2, Plus, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { StaffDocumentInput } from "@/lib/staff-schemas"

const DOC_KINDS = [
  { value: "OFFER_LETTER", label: "Offer letter" },
  { value: "CERTIFICATE", label: "Certificate / qualification" },
  { value: "ID", label: "ID document" },
  { value: "REFERENCE", label: "Reference letter" },
  { value: "OTHER", label: "Other" },
]

type Row = StaffDocumentInput & { _localId: string; _uploading?: boolean }

export function StepDocuments({
  defaults,
  onSubmit,
  onBack,
  submitting,
}: {
  defaults: StaffDocumentInput[]
  onSubmit: (docs: StaffDocumentInput[]) => void
  onBack: () => void
  submitting: boolean
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    defaults.map((d, i) => ({ ...d, _localId: `init-${i}` })),
  )
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function addRow() {
    setRows((p) => [
      ...p,
      { _localId: crypto.randomUUID(), kind: "CERTIFICATE", label: "", url: "" },
    ])
  }

  function patch(id: string, value: Partial<Row>) {
    setRows((p) => p.map((r) => (r._localId === id ? { ...r, ...value } : r)))
  }
  function remove(id: string) {
    setRows((p) => p.filter((r) => r._localId !== id))
  }

  async function uploadFor(id: string, file: File) {
    patch(id, { _uploading: true })
    try {
      const presign = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          scope: "documents",
        }),
      })
      if (!presign.ok) {
        const err = (await presign.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? "presign failed")
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
      if (!put.ok) throw new Error("upload failed")
      patch(id, { url: publicUrl, label: rows.find((r) => r._localId === id)?.label || file.name })
    } catch (e) {
      console.error(e)
      toast.error("Upload failed")
    } finally {
      patch(id, { _uploading: false })
    }
  }

  function submit() {
    const docs = rows
      .filter((r) => r.url)
      .map(({ _localId, _uploading, ...d }) => d)
    onSubmit(docs)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Documents</h2>
          <p className="text-xs text-muted-foreground">
            Upload offer letter, qualification certificates, and ID. All optional, but recommended.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-3 w-3" /> Add document
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No documents added yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r._localId} className="grid grid-cols-[160px_1fr_auto_36px] gap-2 rounded-md border p-3">
              <div className="space-y-1">
                <Label className="text-xs">Kind</Label>
                <Select value={r.kind} onValueChange={(v) => patch(r._localId, { kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Label</Label>
                <Input
                  placeholder="e.g. WAEC certificate"
                  value={r.label}
                  onChange={(e) => patch(r._localId, { label: e.target.value })}
                />
                {r.url && <p className="truncate text-[10px] text-muted-foreground">{r.url}</p>}
              </div>
              <div className="flex items-end">
                <input
                  ref={(el) => {
                    fileRefs.current[r._localId] = el
                  }}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void uploadFor(r._localId, f)
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRefs.current[r._localId]?.click()}
                  disabled={r._uploading}
                >
                  {r._uploading ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1.5 h-4 w-4" />
                  )}
                  {r.url ? "Replace" : "Upload"}
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(r._localId)}
                className="self-end"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
          ← Back
        </Button>
        <Button type="button" onClick={submit} disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Register staff
        </Button>
      </div>
    </div>
  )
}
