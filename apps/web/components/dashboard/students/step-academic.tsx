"use client"

import { useEffect, useMemo } from "react"
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
import { academicStepSchema, type AcademicStepInput } from "@/lib/student-schemas"
import type { ClassOpt, AyOpt } from "@/components/dashboard/students/registration-wizard"

export function StepAcademic({
  defaults,
  classes,
  academicYears,
  onBack,
  onSubmit,
}: {
  defaults?: AcademicStepInput
  classes: ClassOpt[]
  academicYears: AyOpt[]
  onBack: () => void
  onSubmit: (v: AcademicStepInput) => void
}) {
  const defaultAy = academicYears.find((a) => a.isCurrent) ?? academicYears[0]

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AcademicStepInput>({
    resolver: zodResolver(academicStepSchema),
    defaultValues:
      defaults ?? {
        classId: "",
        sectionId: "",
        academicYearId: defaultAy?.id ?? "",
        admissionType: "NEW",
        previousSchool: "",
        previousClass: "",
        reasonForTransfer: "",
      },
  })

  const classId = watch("classId")
  const sectionId = watch("sectionId")
  const academicYearId = watch("academicYearId")
  const admissionType = watch("admissionType")
  // Memoised so the effect below depends on the class changing, not on a new
  // array being allocated every render.
  const arms = useMemo(
    () => classes.find((c) => c.id === classId)?.sections ?? [],
    [classes, classId],
  )

  useEffect(() => {
    if (sectionId && !arms.find((a) => a.id === sectionId)) {
      setValue("sectionId", "")
    }
  }, [classId, sectionId, arms, setValue])

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div>
        <h2 className="text-xl font-semibold">Academic details</h2>
        <p className="text-sm text-muted-foreground">
          Where the student is enrolled and what type of admission this is.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Academic session</Label>
          <Select value={academicYearId} onValueChange={(v) => setValue("academicYearId", v)}>
            <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
            <SelectContent>
              {academicYears.map((ay) => (
                <SelectItem key={ay.id} value={ay.id}>
                  {ay.name}
                  {ay.isCurrent ? " (current)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.academicYearId && (
            <p className="text-xs text-destructive">{errors.academicYearId.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Admission type</Label>
          <Select value={admissionType} onValueChange={(v) => setValue("admissionType", v as typeof admissionType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NEW">New admission</SelectItem>
              <SelectItem value="TRANSFER">Transfer</SelectItem>
              <SelectItem value="RE_ADMISSION">Re-admission</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Class</Label>
          <Select value={classId} onValueChange={(v) => setValue("classId", v)}>
            <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.classId && <p className="text-xs text-destructive">{errors.classId.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Arm</Label>
          <Select value={sectionId} onValueChange={(v) => setValue("sectionId", v)} disabled={!classId}>
            <SelectTrigger><SelectValue placeholder={classId ? "Select arm" : "Choose a class first"} /></SelectTrigger>
            <SelectContent>
              {arms.map((s) => (
                <SelectItem key={s.id} value={s.id}>Arm {s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.sectionId && <p className="text-xs text-destructive">{errors.sectionId.message}</p>}
        </div>
        {admissionType !== "NEW" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="previousSchool">Previous school</Label>
              <Input id="previousSchool" {...register("previousSchool")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="previousClass">Previous class</Label>
              <Input id="previousClass" {...register("previousClass")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="reasonForTransfer">Reason for transfer</Label>
              <Input id="reasonForTransfer" {...register("reasonForTransfer")} />
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>← Back</Button>
        <Button type="submit">Continue</Button>
      </div>
    </form>
  )
}
