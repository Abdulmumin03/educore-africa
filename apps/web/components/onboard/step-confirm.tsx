"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
        <p className="text-sm text-destructive">
          Some steps are incomplete. Go back and finish them before launching.
        </p>
        <Button variant="ghost" onClick={onBack}>← Back</Button>
      </div>
    )
  }

  const totalClasses = academic.sections.reduce(
    (acc, s) => acc + CLASSES_BY_TIER[s].length,
    0,
  )
  const totalSections = totalClasses * academic.armsPerClass

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Review & launch</h2>
        <p className="text-sm text-muted-foreground">
          Confirm everything below, then we&apos;ll provision your school.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SummaryCard title="School">
          <Row label="Name" value={school.schoolName} />
          <Row label="Type" value={school.schoolType} />
          <Row label="Email" value={school.email} />
          <Row label="Phone" value={school.phone} />
          <Row label="Address" value={`${school.address}, ${school.lga}, ${school.state}`} />
          {school.website ? <Row label="Website" value={school.website} /> : null}
        </SummaryCard>

        <SummaryCard title="Administrator">
          <Row label="Name" value={`${admin.firstName} ${admin.lastName}`} />
          <Row label="Email" value={admin.email} />
          <Row label="Phone" value={admin.phone} />
        </SummaryCard>

        <SummaryCard title="Academic structure">
          <Row label="Session" value={academic.sessionName} />
          <Row label="Sections" value={academic.sections.join(", ")} />
          <Row label="Arms per class" value={String(academic.armsPerClass)} />
          <Row
            label="Will create"
            value={`${totalClasses} classes · ${totalSections} arms · 3 terms`}
          />
        </SummaryCard>

        <SummaryCard title="Plan">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{plan.plan}</span>
            <Badge variant="secondary">Selected</Badge>
          </div>
        </SummaryCard>
      </div>

      {serverError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
          ← Back
        </Button>
        <Button type="button" onClick={onSubmit} disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Launch my school
        </Button>
      </div>
    </div>
  )
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </h3>
      <dl className="space-y-1.5 text-sm">{children}</dl>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}
