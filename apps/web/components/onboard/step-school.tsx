"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Upload } from "lucide-react"
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
import { stepSchoolSchema, type StepSchoolInput, SCHOOL_TYPES } from "@/lib/auth-schemas"

type Props = {
  defaults?: StepSchoolInput
  onSubmit: (values: StepSchoolInput) => void
}

export function StepSchool({ defaults, onSubmit }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(defaults?.logoUrl || null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StepSchoolInput>({
    resolver: zodResolver(stepSchoolSchema),
    defaultValues: defaults ?? { schoolType: "PRIVATE", logoUrl: "" },
  })

  const schoolType = watch("schoolType")
  const logoUrl = watch("logoUrl")

  async function onFile(file: File) {
    setUploadError(null)
    // Local preview always works.
    const reader = new FileReader()
    reader.onload = () => setLocalPreview(String(reader.result))
    reader.readAsDataURL(file)

    setUploading(true)
    try {
      const presign = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
          scope: "onboarding",
        }),
      })
      const presignJson = (await presign.json()) as {
        ok?: boolean
        uploadUrl?: string
        publicUrl?: string
        error?: string
      }
      if (!presign.ok || !presignJson.ok) {
        setUploadError(presignJson.error ?? "Upload not available right now")
        return
      }
      const put = await fetch(presignJson.uploadUrl!, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type },
      })
      if (!put.ok) {
        setUploadError("Upload failed. Try again.")
        return
      }
      setValue("logoUrl", presignJson.publicUrl ?? "")
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div>
        <h2 className="text-xl font-semibold">School details</h2>
        <p className="text-sm text-muted-foreground">
          Public details about your school. You can update these later.
        </p>
      </div>

      <div className="space-y-2">
        <Label>School logo</Label>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border bg-muted">
            {localPreview ? (
              <Image src={localPreview} alt="Logo" width={80} height={80} className="h-full w-full object-cover" />
            ) : (
              <Upload className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onFile(file)
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {logoUrl ? "Replace logo" : "Upload logo"}
            </Button>
            {uploadError ? (
              <p className="text-xs text-destructive">{uploadError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">PNG, JPEG, WebP or SVG · max 2 MB · optional</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="schoolName">School name</Label>
          <Input id="schoolName" {...register("schoolName")} aria-invalid={!!errors.schoolName} />
          {errors.schoolName && <p className="text-sm text-destructive">{errors.schoolName.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="schoolType">School type</Label>
          <Select value={schoolType} onValueChange={(v) => setValue("schoolType", v as typeof schoolType)}>
            <SelectTrigger id="schoolType">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {SCHOOL_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.schoolType && <p className="text-sm text-destructive">{errors.schoolType.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" type="tel" placeholder="+2348012345678" {...register("phone")} aria-invalid={!!errors.phone} />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">School email</Label>
          <Input id="email" type="email" {...register("email")} aria-invalid={!!errors.email} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="website">Website (optional)</Label>
          <Input id="website" type="url" placeholder="https://" {...register("website")} aria-invalid={!!errors.website} />
          {errors.website && <p className="text-sm text-destructive">{errors.website.message}</p>}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="address">Address</Label>
          <Input id="address" {...register("address")} aria-invalid={!!errors.address} />
          {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="state">State</Label>
          <Input id="state" placeholder="Lagos" {...register("state")} aria-invalid={!!errors.state} />
          {errors.state && <p className="text-sm text-destructive">{errors.state.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="lga">LGA</Label>
          <Input id="lga" placeholder="Ikeja" {...register("lga")} aria-invalid={!!errors.lga} />
          {errors.lga && <p className="text-sm text-destructive">{errors.lga.message}</p>}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit">Continue</Button>
      </div>
    </form>
  )
}
