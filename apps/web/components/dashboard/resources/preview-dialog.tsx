"use client"

import { Download, FileAudio, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Resource } from "@/components/dashboard/resources/resource-library"

export function ResourcePreviewDialog({
  resource,
  open,
  onClose,
  onOpenExternal,
}: {
  resource: Resource | null
  open: boolean
  onClose: () => void
  onOpenExternal: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">
            {resource?.title ?? ""}
          </DialogTitle>
        </DialogHeader>

        {resource && (
          <div className="space-y-3">
            <PreviewBody resource={resource} />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Uploaded by {resource.uploader.firstName} {resource.uploader.lastName}
                {resource.subject ? ` · ${resource.subject.code}` : ""}
              </span>
              <Button asChild variant="outline" size="sm" onClick={onOpenExternal}>
                <a href={resource.url} target="_blank" rel="noopener">
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Open in new tab
                </a>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PreviewBody({ resource }: { resource: Resource }) {
  if (resource.kind === "VIDEO" && resource.youtubeId) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${encodeURIComponent(resource.youtubeId)}`}
          title={resource.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    )
  }
  if (resource.kind === "IMAGE") {
    return (
      <div className="max-h-[60vh] overflow-auto rounded-md border bg-muted/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resource.url}
          alt={resource.title}
          className="mx-auto block max-h-[60vh] w-auto"
        />
      </div>
    )
  }
  if (resource.kind === "PDF") {
    return (
      <iframe
        src={resource.url}
        title={resource.title}
        className="h-[70vh] w-full rounded-md border bg-muted/40"
      />
    )
  }
  if (resource.kind === "AUDIO") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border bg-muted/30 p-6">
        <FileAudio className="h-10 w-10 text-muted-foreground" />
        <audio controls src={resource.url} className="w-full max-w-md">
          Your browser does not support the audio tag.
        </audio>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border bg-muted/30 p-12 text-center">
      <FileText className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Preview not available — use the button below to open the file.
      </p>
    </div>
  )
}
