import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/shared/page-header"
import { requireRole } from "@/lib/session"
import { atRiskSchools } from "@/lib/support"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"
import { SupportNav } from "../support-nav"

export const metadata: Metadata = { title: "School Health Monitor" }
export const dynamic = "force-dynamic"

function band(score: number) {
  if (score >= 80) return { label: "Excellent", tone: "text-sa-green", bar: "bg-sa-green" }
  if (score >= 60) return { label: "Good", tone: "text-sa-teal", bar: "bg-sa-teal" }
  if (score >= 40) return { label: "At risk", tone: "text-sa-amber", bar: "bg-sa-amber" }
  return { label: "Critical", tone: "text-sa-red", bar: "bg-sa-red" }
}

export default async function HealthPage() {
  await requireRole("SUPPORT_ADMIN", "BUSINESS_ADMIN")

  const schools = await atRiskSchools()
  const mrrAtRisk = schools.reduce((sum, school) => sum + school.mrr, 0)
  const critical = schools.filter((school) => school.health < 40).length

  return (
    <>
      <PageHeader
        title="School health monitor"
        description="Schools worth a call. Four independent signals — a school qualifies on any one of them."
      />

      <SupportNav />

      <div className="grid gap-4 sm:grid-cols-3">
        <section className="rounded-lg border border-sa-border bg-sa-surface p-4">
          <p className="text-caption uppercase tracking-wide text-sa-dim">Schools flagged</p>
          <p className="mt-1 font-mono text-display tabular-nums text-sa-text">
            {formatNumber(schools.length)}
          </p>
        </section>
        <section className="rounded-lg border border-sa-border bg-sa-surface p-4">
          <p className="text-caption uppercase tracking-wide text-sa-dim">Critical</p>
          <p
            className={cn(
              "mt-1 font-mono text-display tabular-nums",
              critical > 0 ? "text-sa-red" : "text-sa-green",
            )}
          >
            {formatNumber(critical)}
          </p>
        </section>
        <section className="rounded-lg border border-sa-border bg-sa-surface p-4">
          <p className="text-caption uppercase tracking-wide text-sa-dim">MRR at risk</p>
          <p className="mt-1 font-mono text-display tabular-nums text-sa-amber">
            {formatCurrency(mrrAtRisk)}
          </p>
        </section>
      </div>

      <section className="mt-4 rounded-lg border border-sa-border bg-sa-surface">
        <header className="border-b border-sa-border px-4 py-2.5">
          <h2 className="text-h3">Flagged schools</h2>
          <p className="text-caption text-sa-dim">Lowest health score first</p>
        </header>

        {schools.length === 0 ? (
          <p className="px-4 py-10 text-center text-body text-sa-muted">
            No school is currently tripping a risk signal.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    School
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Health
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Why it is flagged
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Open tickets
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    MRR
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Last login
                  </th>
                </tr>
              </thead>
              <tbody>
                {schools.map((school) => {
                  const tone = band(school.health)
                  return (
                    <tr key={school.schoolId} className="border-b border-sa-border/60 last:border-0">
                      <td className="px-4 py-2">
                        <Link
                          href={`/console/schools/${school.schoolId}`}
                          className="text-body text-sa-text hover:text-sa-blue"
                        >
                          {school.school}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-sa-raised">
                            <div
                              className={cn("h-1.5 rounded-full", tone.bar)}
                              style={{ width: `${Math.max(2, school.health)}%` }}
                            />
                          </div>
                          <span className={cn("font-mono text-caption tabular-nums", tone.tone)}>
                            {school.health}
                          </span>
                          <span className="text-caption text-sa-dim">{tone.label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <ul className="flex flex-wrap gap-1.5">
                          {school.reasons.map((reason) => (
                            <li
                              key={reason}
                              className="rounded border border-sa-amber/40 bg-sa-amber/10 px-1.5 py-0.5 text-caption text-sa-amber"
                            >
                              {reason}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-sa-muted">
                        {school.openTickets}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-sa-text">
                        {formatCurrency(school.mrr)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-caption tabular-nums text-sa-dim">
                        {school.lastLoginAt
                          ? new Date(school.lastLoginAt).toLocaleDateString("en-GB")
                          : "never"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
