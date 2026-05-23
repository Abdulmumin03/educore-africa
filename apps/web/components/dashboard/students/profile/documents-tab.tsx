"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import dayjs from "dayjs"
import { Loader2, Upload, FileText, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { StudentDTO } from "@/components/dashboard/students/profile/types"

const KINDS = [
  { value: "birth_certificate", label: "Birth certificate" },
  { value: "report_card", label: "Report card" },
  { value: "waec_result", label: "WAEC / NECO result" },
  { value: "admission_letter", label: "Admission letter" },
  { value: "medical_form", label: "Medical form" },
  { value: "other", label: "Other" },
] as const

const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label])) as Record<string, string>

export function DocumentsTab({ student, canWrite }: { student: StudentDTO; canWrite: boolean }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("birth_certificate")
  const [uploading, setUploading] = useState(false)

  async function uploadDoc(file: File) {
    setUploading(true)
    try {
      const presign = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          scope: "school",
        }),
      })
      const data = (await presign.json()) as {
        ok?: boolean
        uploadUrl?: string
        publicUrl?: string
        error?: string
      }
      if (!presign.ok || !data.ok) {
        toast.error(data.error ?? "Upload not configured")
        return
      }
      const put = await fetch(data.uploadUrl!, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type || "application/octet-stream" },
      })
      if (!put.ok) {
        toast.error("Upload failed")
        return
      }
      const save = await fetch(`/api/students/${student.id}/documents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          label: file.name,
          url: data.publicUrl,
          fileSize: file.size,
        }),
      })
      if (!save.ok) {
        toast.error("Couldn't save document record")
        return
      }
      toast.success("Document added")
      router.refresh()
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Documents</CardTitle>
          <p className="text-xs text-muted-foreground">
            Birth certificate, report cards, WAEC, admission letter, medical forms.
          </p>
        </div>
        {canWrite && (
          <div className="flex items-end gap-2">
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void uploadDoc(file)
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} size="sm">
              {uploading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-4 w-4" />
              )}
              Upload
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {student.documents.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
            <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No documents uploaded yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add birth certificates, report cards, or admission letters above.
            </p>
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {student.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">
                      {d.label || KIND_LABEL[d.kind] || d.kind}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {KIND_LABEL[d.kind] ?? d.kind} · {dayjs(d.createdAt).format("D MMM YYYY")}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {d.kind.replace("_", " ")}
                  </Badge>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={d.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                      Open
                    </a>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
