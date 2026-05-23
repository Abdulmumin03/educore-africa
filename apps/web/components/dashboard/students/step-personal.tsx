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
import { personalSchema, type PersonalInput } from "@/lib/student-schemas"

export function StepPersonal({
  defaults,
  onSubmit,
}: {
  defaults?: PersonalInput
  onSubmit: (v: PersonalInput) => void
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
  } = useForm<PersonalInput>({
    resolver: zodResolver(personalSchema),
    defaultValues:
      defaults ??
      ({
        gender: "MALE" as const,
        nationality: "Nigerian",
        admissionDate: new Date().toISOString().slice(0, 10),
      } as PersonalInput),
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
      const data = (await presign.json()) as {
        ok?: boolean
        uploadUrl?: string
        publicUrl?: string
        error?: string
      }
      if (!presign.ok || !data.ok) {
        toast.error(data.error ?? "Upload not available — saved with local preview only")
        return
      }
      const put = await fetch(data.uploadUrl!, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type },
      })
      if (!put.ok) {
        toast.error("Upload failed")
        return
      }
      setValue("photoUrl", data.publicUrl ?? "", { shouldDirty: true })
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div>
        <h2 className="text-xl font-semibold">Personal information</h2>
        <p className="text-sm text-muted-foreground">Names, identity, and origin.</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {preview ? (
            <Image src={preview} alt="Photo" width={80} height={80} className="h-full w-full object-cover" />
          ) : (
            <Upload className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void uploadPhoto(file)
            }}
          />
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {photoUrl ? "Replace photo" : "Upload photo"}
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">PNG / JPEG / WebP · max 2 MB · optional</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" {...register("firstName")} aria-invalid={!!errors.firstName} />
          {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" {...register("lastName")} aria-invalid={!!errors.lastName} />
          {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="middleName">Middle name</Label>
          <Input id="middleName" {...register("middleName")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gender">Gender</Label>
          <Select value={gender} onValueChange={(v) => setValue("gender", v as PersonalInput["gender"])}>
            <SelectTrigger id="gender"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="MALE">Male</SelectItem>
              <SelectItem value="FEMALE">Female</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dateOfBirth">Date of birth</Label>
          <Input id="dateOfBirth" type="date" {...register("dateOfBirth")} aria-invalid={!!errors.dateOfBirth} />
          {errors.dateOfBirth && <p className="text-xs text-destructive">{errors.dateOfBirth.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admissionDate">Admission date</Label>
          <Input id="admissionDate" type="date" {...register("admissionDate")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admissionNumber">Admission no. (optional)</Label>
          <Input id="admissionNumber" placeholder="auto-generated" {...register("admissionNumber")} />
          <p className="text-xs text-muted-foreground">Leave blank to auto-generate (SCH-YYYY-NNNN).</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="religion">Religion</Label>
          <Input id="religion" {...register("religion")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bloodGroup">Blood group</Label>
          <Input id="bloodGroup" placeholder="O+" {...register("bloodGroup")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="genotype">Genotype</Label>
          <Input id="genotype" placeholder="AA" {...register("genotype")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stateOfOrigin">State of origin</Label>
          <Input id="stateOfOrigin" {...register("stateOfOrigin")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lga">LGA</Label>
          <Input id="lga" {...register("lga")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="nationality">Nationality</Label>
          <Input id="nationality" {...register("nationality")} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit">Continue</Button>
      </div>
    </form>
  )
}
