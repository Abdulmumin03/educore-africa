"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Stepper, type Step } from "@/components/onboard/stepper"
import { StepSchool } from "@/components/onboard/step-school"
import { StepAdmin } from "@/components/onboard/step-admin"
import { StepAcademic } from "@/components/onboard/step-academic"
import { StepPlan } from "@/components/onboard/step-plan"
import { StepConfirm } from "@/components/onboard/step-confirm"
import type {
  StepSchoolInput,
  StepAdminInput,
  StepAcademicInput,
  StepPlanInput,
} from "@/lib/auth-schemas"

const STEPS: Step[] = [
  { key: "school", title: "School details" },
  { key: "admin", title: "Admin account" },
  { key: "academic", title: "Academic structure" },
  { key: "plan", title: "Subscription plan" },
  { key: "confirm", title: "Confirm & go live" },
]

export type WizardData = {
  school?: StepSchoolInput
  admin?: StepAdminInput
  academic?: StepAcademicInput
  plan?: StepPlanInput
}

export function OnboardWizard() {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [data, setData] = useState<WizardData>({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const back = () => setIndex((i) => Math.max(0, i - 1))

  async function submitAll() {
    if (!data.school || !data.admin || !data.academic || !data.plan) return
    setSubmitting(true)
    setServerError(null)
    try {
      const res = await fetch("/api/auth/register-school", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
      const payload = (await res.json()) as {
        ok?: boolean
        redirectUrl?: string
        error?: string
      }
      if (!res.ok || !payload.ok) {
        setServerError(payload.error ?? "Registration failed. Please try again.")
        return
      }
      router.push(payload.redirectUrl ?? "/auth/login")
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Network error")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            EduCore Africa
          </Link>
          <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-foreground">
            Already have an account? Sign in
          </Link>
        </div>
      </header>

      <div className="container mx-auto max-w-3xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Register your school</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Five short steps and you&apos;re live. Takes about 5 minutes.
          </p>
        </div>

        <div className="mb-8">
          <Stepper steps={STEPS} currentIndex={index} />
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          {index === 0 && (
            <StepSchool
              defaults={data.school}
              onSubmit={(values) => {
                setData((d) => ({ ...d, school: values }))
                setIndex(1)
              }}
            />
          )}
          {index === 1 && (
            <StepAdmin
              defaults={data.admin}
              onBack={back}
              onSubmit={(values) => {
                setData((d) => ({ ...d, admin: values }))
                setIndex(2)
              }}
            />
          )}
          {index === 2 && (
            <StepAcademic
              defaults={data.academic}
              onBack={back}
              onSubmit={(values) => {
                setData((d) => ({ ...d, academic: values }))
                setIndex(3)
              }}
            />
          )}
          {index === 3 && (
            <StepPlan
              defaults={data.plan}
              onBack={back}
              onSubmit={(values) => {
                setData((d) => ({ ...d, plan: values }))
                setIndex(4)
              }}
            />
          )}
          {index === 4 && (
            <StepConfirm
              data={data}
              onBack={back}
              onSubmit={submitAll}
              submitting={submitting}
              serverError={serverError}
            />
          )}
        </div>
      </div>
    </div>
  )
}
