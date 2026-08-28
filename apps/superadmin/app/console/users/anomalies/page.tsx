import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle, Info, ShieldAlert } from "lucide-react"

import { PageHeader } from "@/components/shared/page-header"
import { detectAnomalies, type Anomaly } from "@/lib/anomalies"
import { requireRole } from "@/lib/session"
import { cn, formatNumber } from "@/lib/utils"
import { UsersNav } from "../users-nav"

export const metadata: Metadata = { title: "Login Anomalies" }
export const dynamic = "force-dynamic"

const SEVERITY: Record<Anomaly["severity"], { tone: string; chip: string; Icon: typeof ShieldAlert }> = {
  critical: { tone: "text-sa-red", chip: "bg-sa-red/15 text-sa-red", Icon: ShieldAlert },
  warning: { tone: "text-sa-amber", chip: "bg-sa-amber/15 text-sa-amber", Icon: AlertTriangle },
  info: { tone: "text-sa-blue", chip: "bg-sa-blue/15 text-sa-blue", Icon: Info },
}

const KIND_LABEL: Record<Anomaly["kind"], string> = {
  new_ip: "New address",
  many_ips: "Many addresses",
  brute_force: "Repeated failures",
  blocked_ip: "Blocked address",
  account_locked: "Account locked",
}

export default async function AnomaliesPage() {
  await requireRole("SUPPORT_ADMIN", "ENGINEERING_ADMIN")

  const { anomalies, unavailable } = await detectAnomalies()
  const critical = anomalies.filter((entry) => entry.severity === "critical").length

  return (
    <>
      <PageHeader
        title="Login anomalies"
        description="Signals the platform can actually observe, over the last 14 days."
      />

      <UsersNav />

      <div className="grid gap-4 sm:grid-cols-3">
        <section className="rounded-lg border border-sa-border bg-sa-surface p-4">
          <p className="text-caption uppercase tracking-wide text-sa-dim">Signals raised</p>
          <p className="mt-1 font-mono text-display tabular-nums text-sa-text">
            {formatNumber(anomalies.length)}
          </p>
          <p className="text-caption text-sa-dim">
            {formatNumber(anomalies.reduce((sum, entry) => sum + entry.occurrences, 0))} events,
            grouped by kind, account and address
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
          <p className="text-caption uppercase tracking-wide text-sa-dim">Console vs school</p>
          <p className="mt-1 font-mono text-display tabular-nums text-sa-text">
            {anomalies.filter((entry) => entry.scope === "console").length}
            <span className="mx-1.5 text-sa-disabled">/</span>
            {anomalies.filter((entry) => entry.scope === "school").length}
          </p>
        </section>
      </div>

      <section className="mt-4 rounded-lg border border-sa-border bg-sa-surface">
        <header className="border-b border-sa-border px-4 py-2.5">
          <h2 className="text-h3">Signals</h2>
          <p className="text-caption text-sa-dim">
            Most recent first · a repeated event is one row with a count, not one row each
          </p>
        </header>

        {anomalies.length === 0 ? (
          <p className="px-4 py-10 text-center text-body text-sa-muted">
            Nothing unusual in the window.
          </p>
        ) : (
          <ul>
            {anomalies.map((anomaly) => {
              const style = SEVERITY[anomaly.severity]
              return (
                <li
                  key={anomaly.id}
                  className="flex items-start gap-3 border-b border-sa-border/60 px-4 py-2.5 last:border-0"
                >
                  <style.Icon
                    className={cn("mt-0.5 h-4 w-4 shrink-0", style.tone)}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-caption font-medium",
                          style.chip,
                        )}
                      >
                        {KIND_LABEL[anomaly.kind]}
                      </span>
                      <span className="font-mono text-body text-sa-text">{anomaly.subject}</span>
                      {anomaly.schoolId && anomaly.school && (
                        <Link
                          href={`/console/schools/${anomaly.schoolId}`}
                          className="text-caption text-sa-blue hover:underline"
                        >
                          {anomaly.school}
                        </Link>
                      )}
                      <span className="rounded border border-sa-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sa-dim">
                        {anomaly.scope}
                      </span>
                      {anomaly.occurrences > 1 && (
                        <span
                          title={`First seen ${new Date(anomaly.firstAt).toLocaleString("en-GB")}`}
                          className="rounded bg-sa-raised px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-sa-muted"
                        >
                          ×{anomaly.occurrences}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-body text-sa-muted">{anomaly.detail}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-caption tabular-nums text-sa-muted">
                      {anomaly.ipAddress}
                    </p>
                    <p className="font-mono text-caption tabular-nums text-sa-dim">
                      {new Date(anomaly.at).toLocaleString("en-GB")}
                    </p>
                    {anomaly.actionTaken && (
                      <p className="text-caption text-sa-dim">{anomaly.actionTaken}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-dashed border-sa-border bg-sa-raised/40 p-4">
        <h2 className="text-h3 text-sa-text">Not detected here</h2>
        <ul className="mt-2 space-y-1.5">
          {unavailable.map((reason) => (
            <li key={reason} className="flex gap-2 text-body text-sa-dim">
              <span aria-hidden="true">&bull;</span>
              {reason}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
