"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { StaffAssignmentsInput } from "@/lib/staff-schemas"
import type { ClassOpt, SubjectOpt, AyOpt } from "@/components/dashboard/staff/registration-wizard"

export function StepAssignments({
  defaults,
  subjects,
  classes,
  academicYears,
  onSubmit,
  onBack,
}: {
  defaults?: StaffAssignmentsInput
  subjects: SubjectOpt[]
  classes: ClassOpt[]
  academicYears: AyOpt[]
  onSubmit: (v: StaffAssignmentsInput) => void
  onBack: () => void
}) {
  const currentYear = academicYears.find((a) => a.isCurrent)
  const [subjectIds, setSubjectIds] = useState<string[]>(defaults?.subjectIds ?? [])
  const [sectionIds, setSectionIds] = useState<string[]>(defaults?.sectionIds ?? [])
  const [academicYearId, setAcademicYearId] = useState<string>(
    defaults?.academicYearId ?? currentYear?.id ?? "",
  )

  function toggleSubject(id: string) {
    setSubjectIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  function toggleSection(id: string) {
    setSectionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function submit() {
    onSubmit({ subjectIds, sectionIds, academicYearId: academicYearId || undefined })
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Subjects taught</h2>
            <p className="text-xs text-muted-foreground">
              Pick the subjects this staff member teaches across all classes.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">{subjectIds.length} selected</span>
        </div>
        {subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No subjects configured yet. Add subjects from School Settings before assigning.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => {
              const selected = subjectIds.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSubject(s.id)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs transition",
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input bg-background hover:bg-muted",
                  )}
                >
                  {s.name}{" "}
                  <span className="text-[10px] text-muted-foreground">({s.code})</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Classes & arms</h2>
            <p className="text-xs text-muted-foreground">
              Pick the arms this staff teaches in. Scoped to one academic year.
            </p>
          </div>
          <div className="w-56">
            <Label className="text-xs">Academic year</Label>
            <Select
              value={academicYearId}
              onValueChange={setAcademicYearId}
              disabled={academicYears.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick an academic year" />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                    {a.isCurrent ? " · current" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No classes configured yet. Add classes from School Settings before assigning.
          </p>
        ) : (
          <div className="space-y-2">
            {classes.map((c) => (
              <div key={c.id} className="rounded-md border bg-muted/30 p-3">
                <p className="text-sm font-medium">{c.name}</p>
                {c.sections.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No arms.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.sections.map((s) => {
                      const selected = sectionIds.includes(s.id)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleSection(s.id)}
                          className={cn(
                            "rounded border px-2 py-0.5 text-xs transition",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input bg-background hover:bg-muted",
                          )}
                        >
                          Arm {s.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
            {sectionIds.length > 0 && (
              <Badge variant="outline">{sectionIds.length} arm(s) selected</Badge>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button type="button" onClick={submit}>
          Continue →
        </Button>
      </div>
    </div>
  )
}
