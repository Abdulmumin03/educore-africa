"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { WizardData, ClassOpt, AyOpt } from "@/components/dashboard/students/registration-wizard"

export function StepReview({
  data,
  classes,
  academicYears,
  onBack,
  onSubmit,
  submitting,
}: {
  data: WizardData
  classes: ClassOpt[]
  academicYears: AyOpt[]
  onBack: () => void
  onSubmit: () => void
  submitting: boolean
}) {
  const { personal, academic, guardians, health } = data
  if (!personal || !academic || !guardians || !health) {
    return (
      <div>
        <p className="text-sm text-destructive">Some steps are incomplete. Go back to finish them.</p>
        <Button variant="ghost" onClick={onBack} className="mt-3">← Back</Button>
      </div>
    )
  }

  const klass = classes.find((c) => c.id === academic.classId)
  const arm = klass?.sections.find((s) => s.id === academic.sectionId)
  const ay = academicYears.find((a) => a.id === academic.academicYearId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Review &amp; register</h2>
        <p className="text-sm text-muted-foreground">
          Confirm everything below — submitting creates the student, parent and enrollment records.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Personal">
          <Row k="Name" v={`${personal.firstName}${personal.middleName ? " " + personal.middleName : ""} ${personal.lastName}`} />
          <Row k="Gender" v={personal.gender} />
          <Row k="Date of birth" v={personal.dateOfBirth} />
          <Row k="Admission date" v={personal.admissionDate} />
          {personal.admissionNumber && <Row k="Admission no." v={personal.admissionNumber} />}
          {personal.religion && <Row k="Religion" v={personal.religion} />}
          {personal.stateOfOrigin && <Row k="State / LGA" v={`${personal.stateOfOrigin} / ${personal.lga ?? ""}`} />}
          {personal.bloodGroup && <Row k="Blood / Genotype" v={`${personal.bloodGroup} · ${personal.genotype ?? "-"}`} />}
          <Row k="Nationality" v={personal.nationality} />
        </Card>
        <Card title="Academic">
          <Row k="Session" v={ay?.name ?? academic.academicYearId} />
          <Row k="Class / Arm" v={`${klass?.name ?? academic.classId} · Arm ${arm?.name ?? academic.sectionId}`} />
          <Row k="Admission type" v={academic.admissionType} />
          {academic.previousSchool && <Row k="Previous school" v={academic.previousSchool} />}
          {academic.previousClass && <Row k="Previous class" v={academic.previousClass} />}
          {academic.reasonForTransfer && (
            <Row k="Reason for transfer" v={academic.reasonForTransfer} />
          )}
        </Card>
        <Card title={`Guardians (${guardians.length})`}>
          <ul className="space-y-2 text-sm">
            {guardians.map((g, i) => (
              <li key={i} className="rounded-md bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {g.firstName} {g.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">· {g.relationship}</span>
                  {g.isPrimary && <Badge>Primary</Badge>}
                  {g.parentId && <Badge variant="secondary">Linked</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {g.phone}
                  {g.email ? ` · ${g.email}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Health">
          {health.knownAllergies && <Row k="Allergies" v={health.knownAllergies} />}
          {health.disabilities && <Row k="Disabilities" v={health.disabilities} />}
          {health.specialNeeds && <Row k="Special needs" v={health.specialNeeds} />}
          {health.doctorName && <Row k="Doctor" v={`${health.doctorName} · ${health.doctorPhone ?? ""}`} />}
          {health.medicalInsurance && <Row k="Insurance" v={health.medicalInsurance} />}
          <Row k="Emergency consent" v={health.emergencyMedicalConsent ? "Yes" : "No"} />
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>← Back</Button>
        <Button type="button" onClick={onSubmit} disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Register student
        </Button>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <dl className="space-y-1.5 text-sm">{children}</dl>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  )
}
