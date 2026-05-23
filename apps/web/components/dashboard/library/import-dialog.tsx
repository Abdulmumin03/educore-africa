"use client"

import { useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Download, FileText, Loader2, Upload } from "lucide-react"
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

type ImportResult = {
  added: number
  skipped: number
  failed: number
  results: ({ ok: true; id: string; title: string } | { ok: false; row: number; title: string; error: string })[]
}

export function ImportBooksDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [csv, setCsv] = useState<string>("")
  const [report, setReport] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  function reset() {
    setFile(null)
    setCsv("")
    setReport(null)
  }

  async function pickFile(f: File) {
    if (f.size > 2 * 1024 * 1024) {
      toast.error("CSV must be under 2 MB")
      return
    }
    const text = await f.text()
    setFile(f)
    setCsv(text)
  }

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/library/books/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv }),
      })
      const b = (await res.json().catch(() => ({}))) as ImportResult & { error?: string }
      if (!res.ok) throw new Error(b.error ?? "Import failed")
      return b
    },
    onSuccess: (r) => {
      setReport(r)
      toast.success(
        `Imported ${r.added} book${r.added === 1 ? "" : "s"}` +
          (r.skipped > 0 ? `, skipped ${r.skipped}` : "") +
          (r.failed > 0 ? `, ${r.failed} failed` : ""),
      )
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  function close() {
    reset()
    onClose()
  }

  function done() {
    reset()
    onDone()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import books from CSV</DialogTitle>
          <DialogDescription>
            Bulk add books from a spreadsheet. Download the template to see the expected columns.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Button asChild variant="outline" size="sm">
            <a href="/api/library/books/template" download>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download CSV template
            </a>
          </Button>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void pickFile(f)
              e.target.value = ""
            }}
          />
          {file ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
              <FileText className="h-3 w-3" />
              <span className="truncate flex-1">{file.name}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFile(null)
                  setCsv("")
                  setReport(null)
                }}
              >
                Change
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Choose CSV
            </Button>
          )}

          {report && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-700">Added: {report.added}</span>
                <span className="text-amber-700">Skipped: {report.skipped}</span>
                <span className="text-destructive">Failed: {report.failed}</span>
              </div>
              {report.results.filter((r) => !r.ok).length > 0 && (
                <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[11px] text-muted-foreground">
                  {report.results
                    .filter((r): r is { ok: false; row: number; title: string; error: string } => !r.ok)
                    .map((r, i) => (
                      <li key={i}>
                        Row {r.row}: <span className="font-medium">{r.title}</span> — {r.error}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {report ? (
            <Button onClick={done}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close} disabled={submit.isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => submit.mutate()}
                disabled={!csv || submit.isPending}
              >
                {submit.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Import
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
