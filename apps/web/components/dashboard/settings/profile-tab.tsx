"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const profileSchema = z.object({
  name: z.string().trim().min(2),
  motto: z.string().max(120).optional().nullable(),
  slogan: z.string().max(160).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  state: z.string().max(60).optional().nullable(),
  city: z.string().max(60).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().or(z.literal("")).optional().nullable(),
  website: z.string().url().or(z.literal("")).optional().nullable(),
  accreditationNumber: z.string().max(60).optional().nullable(),
  ministryRegNumber: z.string().max(60).optional().nullable(),
  logoUrl: z.string().url().or(z.literal("")).optional().nullable(),
})

export type ProfileInput = z.infer<typeof profileSchema>

export type SchoolProfile = {
  id: string
  name: string
  slug: string
  motto: string | null
  slogan: string | null
  logoUrl: string | null
  address: string | null
  state: string | null
  city: string | null
  country: string
  phone: string | null
  email: string | null
  website: string | null
  accreditationNumber: string | null
  ministryRegNumber: string | null
}

export function ProfileTab({ school }: { school: SchoolProfile }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(school.logoUrl)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: school.name,
      motto: school.motto ?? "",
      slogan: school.slogan ?? "",
      address: school.address ?? "",
      state: school.state ?? "",
      city: school.city ?? "",
      phone: school.phone ?? "",
      email: school.email ?? "",
      website: school.website ?? "",
      accreditationNumber: school.accreditationNumber ?? "",
      ministryRegNumber: school.ministryRegNumber ?? "",
      logoUrl: school.logoUrl ?? "",
    },
  })

  async function onLogoFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => setLogoPreview(String(reader.result))
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
      const data = (await presign.json()) as { ok?: boolean; uploadUrl?: string; publicUrl?: string; error?: string }
      if (!presign.ok || !data.ok) {
        toast.error(data.error ?? "Upload not available")
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
      setValue("logoUrl", data.publicUrl ?? "", { shouldDirty: true })
      toast.success("Logo uploaded")
    } finally {
      setUploading(false)
    }
  }

  async function onSubmit(values: ProfileInput) {
    const res = await fetch("/api/school/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "Couldn't save school profile")
      return
    }
    toast.success("School profile updated")
    reset(values)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>School profile</CardTitle>
        <CardDescription>Public details shown to parents and students.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              {logoPreview ? (
                <Image
                  src={logoPreview}
                  alt={school.name}
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Upload className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void onLogoFile(file)
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Replace logo
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">PNG, JPEG, WebP or SVG · max 2 MB</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">School name</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <Field id="motto" label="Motto" register={register} />
            <Field id="slogan" label="Slogan" register={register} />
            <Field id="phone" label="Phone" register={register} />
            <Field id="email" label="Email" register={register} type="email" />
            <Field id="website" label="Website" register={register} type="url" />
            <Field id="address" label="Address" register={register} />
            <Field id="state" label="State" register={register} />
            <Field id="city" label="LGA / City" register={register} />
            <Field id="accreditationNumber" label="Accreditation number" register={register} />
            <Field id="ministryRegNumber" label="Ministry / UBEC registration" register={register} />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Field({
  id,
  label,
  register,
  type = "text",
}: {
  id: keyof ProfileInput
  label: string
  register: ReturnType<typeof useForm<ProfileInput>>["register"]
  type?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} {...register(id)} />
    </div>
  )
}
