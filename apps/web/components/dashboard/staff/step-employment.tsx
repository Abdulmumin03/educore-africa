"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { staffEmploymentSchema, type StaffEmploymentInput } from "@/lib/staff-schemas"

const TODAY = new Date().toISOString().slice(0, 10)

export function StepEmployment({
  defaults,
  onSubmit,
  onBack,
}: {
  defaults?: StaffEmploymentInput
  onSubmit: (v: StaffEmploymentInput) => void
  onBack: () => void
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StaffEmploymentInput>({
    resolver: zodResolver(staffEmploymentSchema),
    defaultValues:
      defaults ??
      ({
        staffType: "TEACHING" as const,
        role: "TEACHER" as const,
        hireDate: TODAY,
        experienceYears: 0,
      } as StaffEmploymentInput),
  })

  const staffType = watch("staffType")
  const role = watch("role")

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Staff number">
          <Input placeholder="Auto-generated if blank" {...register("staffNumber")} />
        </Field>
        <Field label="Hire date" error={errors.hireDate?.message}>
          <Input type="date" {...register("hireDate")} />
        </Field>
        <Field label="Staff type" error={errors.staffType?.message}>
          <Select value={staffType} onValueChange={(v) => setValue("staffType", v as StaffEmploymentInput["staffType"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TEACHING">Teaching</SelectItem>
              <SelectItem value="NON_TEACHING">Non-teaching</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
              <SelectItem value="CONTRACT">Contract</SelectItem>
              <SelectItem value="NYSC">NYSC</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Role / User account" error={errors.role?.message}>
          <Select value={role} onValueChange={(v) => setValue("role", v as StaffEmploymentInput["role"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TEACHER">Teacher</SelectItem>
              <SelectItem value="PRINCIPAL">Principal</SelectItem>
              <SelectItem value="SCHOOL_ADMIN">Admin</SelectItem>
              <SelectItem value="BURSAR">Bursar</SelectItem>
              <SelectItem value="COUNSELOR">Counselor</SelectItem>
              <SelectItem value="LIBRARIAN">Librarian</SelectItem>
              <SelectItem value="HOSTEL_MASTER">Hostel master</SelectItem>
              <SelectItem value="DRIVER">Driver</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Department">
          <Input placeholder="e.g. Mathematics, Bursary" {...register("department")} />
        </Field>
        <Field label="Highest qualification">
          <Input placeholder="e.g. B.Ed Maths, M.Sc Acc" {...register("qualification")} />
        </Field>
        <Field label="Experience (years)" error={errors.experienceYears?.message}>
          <Input
            type="number"
            min={0}
            max={60}
            {...register("experienceYears", { valueAsNumber: true })}
          />
        </Field>
      </div>

      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button type="submit">Continue →</Button>
      </div>
    </form>
  )
}

function Field({
  label,
  children,
  error,
}: {
  label: string
  children: React.ReactNode
  error?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
