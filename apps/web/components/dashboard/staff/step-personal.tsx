"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Upload } from "lucide-react"
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
import { staffPersonalSchema, type StaffPersonalInput } from "@/lib/staff-schemas"

export function StepPersonal({
  defaults,
  onSubmit,
}: {
  defaults?: StaffPersonalInput
  onSubmit: (v: StaffPersonalInput) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(defaults?.photoUrl || null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StaffPersonalInput>({
    resolver: zodResolver(staffPersonalSchema),
    defaultValues: defaults ?? ({ gender: "MALE" as const } as StaffPersonalInput),
  })

  const gender = watch("gender")
  const photoUrl = watch("photoUrl")

  async function uploadPhoto(file: File) {
    const reader = new FileReader()
    reader.onload = () => setPreview(String(reader.result))
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
          scope: "school",
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
      const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type } })
      if (!put.ok) throw new Error("upload failed")
      setValue("photoUrl", publicUrl, { shouldValidate: true })
    } catch (e) {
      console.error(e)
      toast.error("Photo upload failed — you can continue without one")
    } finally {
      setUploading(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
        <div className="space-y-2">
          <Label className="text-xs">Photo</Label>
          <div className="relative h-28 w-28 overflow-hidden rounded-full border bg-muted">
            {preview ? (
              <Image src={preview} alt="" fill className="object-cover" sizes="112px" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                No photo
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
              if (f) void uploadPhoto(f)
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            {photoUrl ? "Replace" : "Upload"}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" error={errors.firstName?.message}>
            <Input {...register("firstName")} />
          </Field>
          <Field label="Last name" error={errors.lastName?.message}>
            <Input {...register("lastName")} />
          </Field>
          <Field label="Middle name">
            <Input {...register("middleName")} />
          </Field>
          <Field label="Gender" error={errors.gender?.message}>
            <Select value={gender} onValueChange={(v) => setValue("gender", v as StaffPersonalInput["gender"]) }>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date of birth" error={errors.dateOfBirth?.message}>
            <Input type="date" {...register("dateOfBirth")} />
          </Field>
          <Field label="Phone" error={errors.phone?.message}>
            <Input placeholder="+234..." {...register("phone")} />
          </Field>
          <Field label="Email" error={errors.email?.message} className="sm:col-span-2">
            <Input type="email" {...register("email")} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input {...register("address")} />
          </Field>
          <Field label="State of origin">
            <Input {...register("stateOfOrigin")} />
          </Field>
          <Field label="NIN">
            <Input placeholder="11 digits" maxLength={11} {...register("nin")} />
          </Field>
          <Field label="BVN" error={errors.bvn?.message}>
            <Input placeholder="11 digits" maxLength={11} {...register("bvn")} />
          </Field>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit">Continue →</Button>
      </div>
    </form>
  )
}

function Field({
  label,
  children,
  error,
  className,
}: {
  label: string
  children: React.ReactNode
  error?: string
  className?: string
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
