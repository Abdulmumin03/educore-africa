"use client"

import { Loader2, Building2, UserCog, GraduationCap, Tag, Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import type { WizardData } from "@/components/onboard/onboard-wizard"
import { CLASSES_BY_TIER } from "@/lib/academic-structure"

type Props = {
  data: WizardData
  onBack: () => void
  onSubmit: () => void
  submitting: boolean
  serverError: string | null
}

export function StepConfirm({ data, onBack, onSubmit, submitting, serverError }: Props) {
  const { school, admin, academic, plan } = data
  if (!school || !admin || !academic || !plan) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          Some steps are incomplete. Go back and finish them before launching.
        </p>
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-navy/65 hover:bg-cream-soft hover:text-navy"
        >
          ← Back
        </Button>
      </div>
    )
  }

  const totalClasses = academic.sections.reduce(
    (acc, s) => acc + CLASSES_BY_TIER[s].length,
    0,
  )
  const totalSections = totalClasses * academic.armsPerClass

  return (
    <div className="space-y-7">
      <ScrollReveal>
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
            Step 5 of 5
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-navy md:text-3xl">
            Review &amp; launch
          </h2>
          <p className="mt-1.5 text-sm text-navy/65">
            Confirm everything below, then we&apos;ll provision your school.
          </p>
        </div>
      </ScrollReveal>

      <div className="grid gap-4 md:grid-cols-2">
        <ScrollReveal delay={80}>
          <SummaryCard title="School" icon={<Building2 className="h-3.5 w-3.5" />}>
            <Row label="Name" value={school.schoolName} />
            <Row label="Type" value={school.schoolType} />
            <Row label="Email" value={school.email} />
            <Row label="Phone" value={school.phone} />
            <Row
              label="Address"
              value={`${school.address}, ${school.lga}, ${school.state}`}
            />
            {school.website ? <Row label="Website" value={school.website} /> : null}
          </SummaryCard>
        </ScrollReveal>

        <ScrollReveal delay={160}>
          <SummaryCard title="Administrator" icon={<UserCog className="h-3.5 w-3.5" />}>
            <Row label="Name" value={`${admin.firstName} ${admin.lastName}`} />
            <Row label="Email" value={admin.email} />
            <Row label="Phone" value={admin.phone} />
          </SummaryCard>
        </ScrollReveal>

        <ScrollReveal delay={240}>
          <SummaryCard
            title="Academic structure"
            icon={<GraduationCap className="h-3.5 w-3.5" />}
          >
            <Row label="Session" value={academic.sessionName} />
            <Row label="Sections" value={academic.sections.join(", ")} />
            <Row label="Arms per class" value={String(academic.armsPerClass)} />
            <Row
              label="Will create"
              value={`${totalClasses} classes · ${totalSections} arms · 3 terms`}
            />
          </SummaryCard>
        </ScrollReveal>

        <ScrollReveal delay={320}>
          <SummaryCard title="Plan" icon={<Tag className="h-3.5 w-3.5" />}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-navy">{plan.plan}</span>
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-200">
                Selected
              </span>
            </div>
          </SummaryCard>
        </ScrollReveal>
      </div>

      {serverError && (
        <ScrollReveal>
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {serverError}
          </p>
        </ScrollReveal>
      )}

      <ScrollReveal delay={400}>
        <div className="flex items-center justify-between border-t border-navy/10 pt-5">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={submitting}
            className="text-navy/65 hover:bg-cream-soft hover:text-navy"
          >
            ← Back
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="h-11 bg-navy px-6 text-white shadow-lg shadow-amber-500/10 hover:bg-[#0a2350]"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-2 h-4 w-4" />
            )}
            Launch my school
          </Button>
        </div>
      </ScrollReveal>
    </div>
  )
}

function SummaryCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="h-full rounded-xl border border-navy/10 bg-cream-soft p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-navy text-amber-300">
          {icon}
        </span>
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-navy/65">
          {title}
        </h3>
      </div>
      <dl className="space-y-1.5 text-sm">{children}</dl>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-navy/55">{label}</dt>
      <dd className="text-right font-medium text-navy">{value}</dd>
    </div>
  )
}
