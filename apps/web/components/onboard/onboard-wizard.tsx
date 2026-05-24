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
    <div className="relative min-h-screen bg-cream text-navy">
      {/* Kente top stripe */}
      <div className="flex h-1.5 w-full overflow-hidden">
        {[
          "#F59E0B", "#0D2B5E", "#C2410C", "#F59E0B", "#0D2B5E",
          "#B45309", "#F59E0B", "#0D2B5E", "#C2410C", "#F59E0B",
        ].map((c, i) => (
          <div key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>

      {/* Subtle pattern */}
      <div className="pointer-events-none absolute inset-0 pattern-dots opacity-60" />

      <header className="relative border-b border-navy/10 bg-cream/80 backdrop-blur">
        <div className="container mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-base font-extrabold text-white">
              E
            </span>
            <span className="text-base font-semibold tracking-tight text-navy">
              EduCore <span className="text-amber-600">Africa</span>
            </span>
          </Link>
          <Link
            href="/auth/login"
            className="text-sm font-medium text-navy/65 hover:text-navy"
          >
            Already have an account?{" "}
            <span className="text-amber-700 hover:text-amber-800">Sign in</span>
          </Link>
        </div>
      </header>

      <div className="container relative mx-auto max-w-3xl px-4 py-10 md:py-14">
        <div className="mb-8">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
            Get started
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-navy md:text-4xl">
            Register your school
          </h1>
          <p className="mt-2 text-base text-navy/65">
            Five short steps and you&apos;re live. Takes about 5 minutes.
          </p>
        </div>

        <div className="mb-8">
          <Stepper steps={STEPS} currentIndex={index} />
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-navy/10 bg-white p-6 shadow-xl shadow-navy/[0.04] md:p-8">
          <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-amber-100/60 blur-3xl" />
          <div className="relative">
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
    </div>
  )
}
