"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
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
import type { StudentDTO } from "@/components/dashboard/students/profile/types"

type EditableFields = {
  middleName: string
  dateOfBirth: string
  gender: "MALE" | "FEMALE" | "OTHER"
  status: "ACTIVE" | "GRADUATED" | "TRANSFERRED" | "WITHDRAWN" | "SUSPENDED" | "DECEASED"
  religion: string
  nationality: string
  stateOfOrigin: string
  lga: string
  bloodGroup: string
  genotype: string
  address: string
}

function toIsoDate(value: string) {
  return value ? value.slice(0, 10) : ""
}

function buildInitial(student: StudentDTO): EditableFields {
  return {
    middleName: student.middleName ?? "",
    dateOfBirth: toIsoDate(student.dateOfBirth),
    gender: student.gender,
    status: (student.status as EditableFields["status"]) ?? "ACTIVE",
    religion: student.religion ?? "",
    nationality: student.nationality ?? "Nigerian",
    stateOfOrigin: student.stateOfOrigin ?? "",
    lga: student.lga ?? "",
    bloodGroup: student.bloodGroup ?? "",
    genotype: student.genotype ?? "",
    address: student.address ?? "",
  }
}

export function EditStudentModal({
  student,
  open,
  onOpenChange,
}: {
  student: StudentDTO
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [form, setForm] = useState<EditableFields>(() => buildInitial(student))

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        middleName: form.middleName.trim() || null,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender,
        status: form.status,
        religion: form.religion.trim() || null,
        nationality: form.nationality.trim() || "Nigerian",
        stateOfOrigin: form.stateOfOrigin.trim() || null,
        lga: form.lga.trim() || null,
        bloodGroup: form.bloodGroup.trim() || null,
        genotype: form.genotype.trim() || null,
        address: form.address.trim() || null,
      }
      const res = await fetch(`/api/students/${student.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? "Couldn't save changes")
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success("Student updated")
      onOpenChange(false)
      router.refresh()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  function update<K extends keyof EditableFields>(key: K, value: EditableFields[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleOpenChange(next: boolean) {
    if (!next) setForm(buildInitial(student))
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit student</DialogTitle>
          <DialogDescription>
            Update personal details and enrollment status. Class assignment is changed
            from the enrollment screen, not here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name">
            <Input value={student.firstName} disabled readOnly />
          </Field>
          <Field label="Last name">
            <Input value={student.lastName} disabled readOnly />
          </Field>
          <Field label="Middle name">
            <Input
              value={form.middleName}
              onChange={(e) => update("middleName", e.target.value)}
            />
          </Field>
          <Field label="Date of birth">
            <Input
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => update("dateOfBirth", e.target.value)}
            />
          </Field>
          <Field label="Gender">
            <Select
              value={form.gender}
              onValueChange={(v) => update("gender", v as EditableFields["gender"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onValueChange={(v) => update("status", v as EditableFields["status"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="GRADUATED">Graduated</SelectItem>
                <SelectItem value="TRANSFERRED">Transferred</SelectItem>
                <SelectItem value="WITHDRAWN">Withdrawn</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
                <SelectItem value="DECEASED">Deceased</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Religion">
            <Input
              value={form.religion}
              onChange={(e) => update("religion", e.target.value)}
            />
          </Field>
          <Field label="Nationality">
            <Input
              value={form.nationality}
              onChange={(e) => update("nationality", e.target.value)}
            />
          </Field>
          <Field label="State of origin">
            <Input
              value={form.stateOfOrigin}
              onChange={(e) => update("stateOfOrigin", e.target.value)}
            />
          </Field>
          <Field label="LGA">
            <Input value={form.lga} onChange={(e) => update("lga", e.target.value)} />
          </Field>
          <Field label="Blood group">
            <Input
              placeholder="e.g. O+"
              value={form.bloodGroup}
              onChange={(e) => update("bloodGroup", e.target.value)}
            />
          </Field>
          <Field label="Genotype">
            <Input
              placeholder="e.g. AA"
              value={form.genotype}
              onChange={(e) => update("genotype", e.target.value)}
            />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
