"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Stepper, type Step } from "@/components/onboard/stepper"
import { StepPersonal } from "@/components/dashboard/students/step-personal"
import { StepAcademic } from "@/components/dashboard/students/step-academic"
import { StepGuardians } from "@/components/dashboard/students/step-guardians"
import { StepHealth } from "@/components/dashboard/students/step-health"
import { StepReview } from "@/components/dashboard/students/step-review"
import type {
  PersonalInput,
  AcademicStepInput,
  GuardianInput,
  HealthStepInput,
} from "@/lib/student-schemas"

export type ClassOpt = { id: string; name: string; sections: { id: string; name: string }[] }
export type AyOpt = { id: string; name: string; isCurrent: boolean }

const STEPS: Step[] = [
  { key: "personal", title: "Personal" },
  { key: "academic", title: "Academic" },
  { key: "guardians", title: "Guardians" },
  { key: "health", title: "Health" },
  { key: "review", title: "Review" },
]

export type WizardData = {
  personal?: PersonalInput
  academic?: AcademicStepInput
  guardians?: GuardianInput[]
  health?: HealthStepInput
}

export function StudentRegistrationWizard({
  classes,
  academicYears,
}: {
  classes: ClassOpt[]
  academicYears: AyOpt[]
}) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [data, setData] = useState<WizardData>({})
  const [submitting, setSubmitting] = useState(false)

  const back = () => setIndex((i) => Math.max(0, i - 1))

  async function submit() {
    if (!data.personal || !data.academic || !data.guardians || !data.health) {
      toast.error("Some steps are incomplete")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
      const json = (await res.json()) as { ok?: boolean; studentId?: string; admissionNumber?: string; error?: string }
      if (!res.ok || !json.ok || !json.studentId) {
        toast.error(json.error ?? "Couldn't register student")
        return
      }
      toast.success(`Student ${json.admissionNumber} registered`)
      router.push(`/dashboard/students/${json.studentId}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Register student</h1>
          <p className="text-sm text-muted-foreground">Five short steps. Cancel anytime.</p>
        </div>
        <Link href="/dashboard/students" className="text-sm text-muted-foreground hover:text-foreground">
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
          <StepAcademic
            defaults={data.academic}
            classes={classes}
            academicYears={academicYears}
            onBack={back}
            onSubmit={(v) => {
              setData((d) => ({ ...d, academic: v }))
              setIndex(2)
            }}
          />
        )}
        {index === 2 && (
          <StepGuardians
            defaults={data.guardians}
            onBack={back}
            onSubmit={(v) => {
              setData((d) => ({ ...d, guardians: v }))
              setIndex(3)
            }}
          />
        )}
        {index === 3 && (
          <StepHealth
            defaults={data.health}
            onBack={back}
            onSubmit={(v) => {
              setData((d) => ({ ...d, health: v }))
              setIndex(4)
            }}
          />
        )}
        {index === 4 && (
          <StepReview
            data={data}
            classes={classes}
            academicYears={academicYears}
            onBack={back}
            onSubmit={submit}
            submitting={submitting}
          />
        )}
      </div>
    </div>
  )
}
