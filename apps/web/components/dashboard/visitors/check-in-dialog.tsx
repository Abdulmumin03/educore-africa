"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Camera, ImagePlus, Loader2, RotateCcw, UserPlus, X } from "lucide-react"
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
import type { Host } from "@/components/dashboard/visitors/visitors-manager"

const NO_HOST = "NONE"

export function CheckInDialog({
  hosts,
  onClose,
  onSaved,
}: {
  hosts: Host[]
  onClose: () => void
  onSaved: () => void
}) {
  const [visitorName, setVisitorName] = useState("")
  const [visitorPhone, setVisitorPhone] = useState("")
  const [idNumber, setIdNumber] = useState("")
  const [purpose, setPurpose] = useState("")
  const [hostUserId, setHostUserId] = useState(NO_HOST)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  async function uploadBlob(blob: Blob, suggestedName: string): Promise<string> {
    const contentType = blob.type || "image/jpeg"
    const presign = await fetch("/api/upload/presign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: suggestedName,
        contentType,
        size: blob.size,
        scope: "visitors",
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
      body: blob,
      headers: { "content-type": contentType },
    })
    if (!put.ok) throw new Error("Upload failed")
    return publicUrl
  }

  async function handleCapture(blob: Blob) {
    setUploading(true)
    try {
      const url = await uploadBlob(blob, `visitor-${Date.now()}.jpg`)
      setPhotoUrl(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  async function handleFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Photo must be under 2 MB")
      return
    }
    setUploading(true)
    try {
      const url = await uploadBlob(file, file.name)
      setPhotoUrl(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/visitors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          visitorName: visitorName.trim(),
          visitorPhone: visitorPhone.trim() || undefined,
          idNumber: idNumber.trim() || undefined,
          purpose: purpose.trim() || undefined,
          hostUserId: hostUserId === NO_HOST ? null : hostUserId,
          photoUrl,
        }),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string; id?: string }
      if (!res.ok) throw new Error(b.error ?? "Failed")
      return b.id ?? null
    },
    onSuccess: (id) => {
      toast.success("Visitor checked in")
      onSaved()
      // Open the badge in a new tab — useful for receptionist to print.
      if (id && typeof window !== "undefined") {
        window.open(`/api/visitors/${id}/badge`, "_blank")
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const canSave =
    visitorName.trim().length >= 2 && !save.isPending && !uploading

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Check in visitor</DialogTitle>
          <DialogDescription>
            Capture a photo, fill in details, and a printable badge is generated on save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <PhotoPanel
            photoUrl={photoUrl}
            uploading={uploading}
            onCapture={handleCapture}
            onPick={handleFile}
            onClear={() => setPhotoUrl(null)}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Visitor name">
              <Input
                value={visitorName}
                onChange={(e) => setVisitorName(e.target.value)}
                placeholder="Full name"
                maxLength={160}
              />
            </Field>
            <Field label="Phone (optional)">
              <Input
                value={visitorPhone}
                onChange={(e) => setVisitorPhone(e.target.value)}
                placeholder="+234…"
                maxLength={20}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ID / NIN (optional)">
              <Input
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="NIN or any photo ID"
                maxLength={40}
              />
            </Field>
            <Field label="Host">
              <Select value={hostUserId} onValueChange={setHostUserId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_HOST}>None</SelectItem>
                  {hosts.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name} ({h.role.replace(/_/g, " ").toLowerCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Purpose">
            <Textarea
              rows={2}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Reason for the visit (e.g. parent meeting, delivery, contractor)."
              maxLength={200}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSave}>
            {save.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-1.5 h-4 w-4" />
            )}
            Check in & print badge
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

function PhotoPanel({
  photoUrl,
  uploading,
  onCapture,
  onPick,
  onClear,
}: {
  photoUrl: string | null
  uploading: boolean
  onCapture: (blob: Blob) => Promise<void> | void
  onPick: (file: File) => Promise<void> | void
  onClear: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  async function startCamera() {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      })
      streamRef.current = stream
      setCameraOn(true)
      // Wait one tick so the <video> ref is in the DOM.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play().catch(() => {})
        }
      })
    } catch (err) {
      setCameraError(
        err instanceof Error ? err.message : "Camera unavailable — use file upload instead.",
      )
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOn(false)
  }

  useEffect(() => stopCamera, [])

  async function snap() {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth || 480
    canvas.height = video.videoHeight || 360
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
    )
    if (!blob) return
    stopCamera()
    await onCapture(blob)
  }

  if (photoUrl) {
    return (
      <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="Visitor" className="h-24 w-20 rounded-md object-cover" />
        <div className="flex-1 text-xs text-muted-foreground">
          Captured. Re-take any time before saving.
        </div>
        <Button size="sm" variant="outline" onClick={onClear}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Re-take
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      {cameraOn ? (
        <div className="space-y-2">
          <video
            ref={videoRef}
            playsInline
            muted
            className="mx-auto h-48 rounded-md bg-black"
          />
          <div className="flex justify-center gap-2">
            <Button size="sm" onClick={snap} disabled={uploading}>
              <Camera className="mr-1.5 h-4 w-4" />
              Capture
            </Button>
            <Button size="sm" variant="ghost" onClick={stopCamera}>
              <X className="mr-1.5 h-4 w-4" />
              Stop
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2 py-4">
          <Button size="sm" variant="outline" onClick={startCamera} disabled={uploading}>
            <Camera className="mr-1.5 h-4 w-4" />
            Open webcam
          </Button>
          <span className="text-xs text-muted-foreground">or</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onPick(f)
              e.target.value = ""
            }}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="mr-1.5 h-4 w-4" />
            )}
            Upload file
          </Button>
        </div>
      )}
      {cameraError && (
        <p className="text-[11px] text-amber-700">{cameraError}</p>
      )}
      <p className="text-center text-[11px] text-muted-foreground">
        Photo is optional but recommended. Max 2 MB.
      </p>
    </div>
  )
}
