"use client"

import dayjs from "dayjs"
import { AlertTriangle, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { StudentDTO } from "@/components/dashboard/students/profile/types"
import { cn } from "@/lib/utils"

export function OverviewTab({ student }: { student: StudentDTO }) {
  const latestRisk = student.riskScores[0]
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Field k="Full name" v={`${student.firstName}${student.middleName ? " " + student.middleName : ""} ${student.lastName}`} />
          <Field k="Date of birth" v={dayjs(student.dateOfBirth).format("D MMM YYYY")} />
          <Field k="Gender" v={student.gender[0] + student.gender.slice(1).toLowerCase()} />
          <Field k="Religion" v={student.religion ?? "—"} />
          <Field k="Nationality" v={student.nationality} />
          <Field k="State / LGA" v={[student.stateOfOrigin, student.lga].filter(Boolean).join(" / ") || "—"} />
          <Field k="Blood / Genotype" v={[student.bloodGroup, student.genotype].filter(Boolean).join(" · ") || "—"} />
          <Field k="Email" v={student.email ?? "—"} />
          <Field k="Phone" v={student.phone ?? "—"} />
          <Field k="Address" v={student.address ?? "—"} />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enrollment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {student.enrollment ? (
              <>
                <Field k="Class · Arm" v={`${student.enrollment.className} · Arm ${student.enrollment.sectionName}`} />
                <Field k="Session" v={student.enrollment.academicYearName} />
                <Field k="Admission" v={`${dayjs(student.admissionDate).format("D MMM YYYY")} · ${student.admissionType}`} />
              </>
            ) : (
              <p className="text-muted-foreground">Not currently enrolled.</p>
            )}
          </CardContent>
        </Card>

        <RiskCard latest={latestRisk} history={student.riskScores} />

        {student.guardians.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Guardians</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {student.guardians.map((g) => (
                <div key={g.id} className="rounded-md bg-muted/40 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {g.firstName} {g.lastName}
                    </span>
                    {g.isPrimary && <Badge>Primary</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {g.relationship ?? "Guardian"} · {g.phone ?? "no phone"}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="text-sm font-medium">{v}</div>
    </div>
  )
}

function RiskCard({
  latest,
  history,
}: {
  latest: StudentDTO["riskScores"][0] | undefined
  history: StudentDTO["riskScores"]
}) {
  if (!latest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Wellbeing</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldCheck className="h-5 w-5 text-emerald-500" />
          <span>No risk score yet — generated nightly.</span>
        </CardContent>
      </Card>
    )
  }

  const variant = riskVariant(latest.level)
  const trend = [...history].reverse().map((r, i) => ({ x: i, y: r.score }))
  const max = Math.max(0.001, ...trend.map((p) => p.y))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI Wellbeing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <Badge variant={variant.badge}>{latest.level}</Badge>
          <span className="text-2xl font-bold tabular-nums">{Math.round(latest.score * 100)}%</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Computed {dayjs(latest.computedAt).fromNow?.() ?? "recently"}
        </p>
        {/* Inline sparkline (SVG, no chart lib) */}
        <svg viewBox="0 0 100 28" className={cn("h-7 w-full", variant.spark)}>
          <polyline
            points={trend
              .map((p, i) => {
                const x = (i / Math.max(1, trend.length - 1)) * 100
                const y = 28 - (p.y / max) * 22 - 3
                return `${x},${y}`
              })
              .join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        {latest.level !== "LOW" && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Flag for review — counselor follow-up suggested.</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function riskVariant(level: string) {
  if (level === "CRITICAL")
    return { badge: "destructive" as const, spark: "text-red-500" }
  if (level === "HIGH")
    return { badge: "destructive" as const, spark: "text-amber-500" }
  if (level === "MEDIUM")
    return { badge: "secondary" as const, spark: "text-amber-500" }
  return { badge: "default" as const, spark: "text-emerald-500" }
}
