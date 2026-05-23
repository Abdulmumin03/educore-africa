"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Stepper, type Step } from "@/components/onboard/stepper"
import { StepPersonal } from "@/components/dashboard/staff/step-personal"
import { StepEmployment } from "@/components/dashboard/staff/step-employment"
import { StepAssignments } from "@/components/dashboard/staff/step-assignments"
import { StepSalary } from "@/components/dashboard/staff/step-salary"
import { StepDocuments } from "@/components/dashboard/staff/step-documents"
import type {
  StaffPersonalInput,
  StaffEmploymentInput,
  StaffAssignmentsInput,
  StaffSalaryInput,
  StaffDocumentInput,
} from "@/lib/staff-schemas"

export type ClassOpt = {
  id: string
  name: string
  sections: { id: string; name: string }[]
}

export type SubjectOpt = {
  id: string
  name: string
  code: string
  category: string
}

export type AyOpt = { id: string; name: string; isCurrent: boolean }

const STEPS: Step[] = [
  { key: "personal", title: "Personal" },
  { key: "employment", title: "Employment" },
  { key: "assignments", title: "Subjects & classes" },
  { key: "salary", title: "Salary" },
  { key: "documents", title: "Documents" },
]

type WizardData = {
  personal?: StaffPersonalInput
  employment?: StaffEmploymentInput
  assignments?: StaffAssignmentsInput
  salary?: StaffSalaryInput
  documents?: StaffDocumentInput[]
}

export function StaffRegistrationWizard({
  subjects,
  classes,
  academicYears,
}: {
  subjects: SubjectOpt[]
  classes: ClassOpt[]
  academicYears: AyOpt[]
}) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [data, setData] = useState<WizardData>({})
  const [submitting, setSubmitting] = useState(false)

  const back = () => setIndex((i) => Math.max(0, i - 1))

  async function submit(documents: StaffDocumentInput[]) {
    const payload = {
      personal: data.personal!,
      employment: data.employment!,
      assignments: data.assignments ?? { subjectIds: [], sectionIds: [] },
      salary: data.salary ?? { allowances: [], deductions: [] },
      documents,
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as {
        ok?: boolean
        staffId?: string
        staffNumber?: string
        error?: string
      }
      if (!res.ok || !json.ok || !json.staffId) {
        toast.error(json.error ?? "Couldn't register staff")
        return
      }
      toast.success(`Staff ${json.staffNumber} registered`)
      router.push(`/dashboard/staff/${json.staffId}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Register staff</h1>
          <p className="text-sm text-muted-foreground">
            Five short steps. Cancel anytime.
          </p>
        </div>
        <Link
          href="/dashboard/staff"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to list
        </Link>
      </div>

      <Stepper steps={STEPS} currentIndex={index} />

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        {index === 0 && (
          <StepPersonal
            defaults={data.personal}
            onSubmit={(v) => {
              setData((d) => ({ ...d, personal: v }))
              setIndex(1)
            }}
          />
        )}
        {index === 1 && (
          <StepEmployment
            defaults={data.employment}
            onBack={back}
            onSubmit={(v) => {
              setData((d) => ({ ...d, employment: v }))
              setIndex(2)
            }}
          />
        )}
        {index === 2 && (
          <StepAssignments
            defaults={data.assignments}
            subjects={subjects}
            classes={classes}
            academicYears={academicYears}
            onBack={back}
            onSubmit={(v) => {
              setData((d) => ({ ...d, assignments: v }))
              setIndex(3)
            }}
          />
        )}
        {index === 3 && (
          <StepSalary
            defaults={data.salary}
            onBack={back}
            onSubmit={(v) => {
              setData((d) => ({ ...d, salary: v }))
              setIndex(4)
            }}
          />
        )}
        {index === 4 && (
          <StepDocuments
            defaults={data.documents ?? []}
            onBack={back}
            onSubmit={submit}
            submitting={submitting}
          />
        )}
      </div>

      {submitting && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Registering…
        </div>
      )}
    </div>
  )
}
