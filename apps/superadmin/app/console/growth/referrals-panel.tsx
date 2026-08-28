"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { Copy, Plus } from "lucide-react"

import { cn, formatNumber } from "@/lib/utils"

type Status = "PENDING" | "SIGNED_UP" | "CONVERTED" | "REWARDED"

export type ReferralRow = {
  id: string
  code: string
  referrerSchoolId: string
  referrer: string
  referredSchoolId: string | null
  referred: string | null
  status: Status
  rewardMonths: number
  rewardedAt: string | null
  createdAt: string
}

export type ReferrerTotals = {
  schoolId: string
  school: string
  codes: number
  signedUp: number
  converted: number
  earnedMonths: number
  awardedMonths: number
}

const STATUS_STYLE: Record<Status, string> = {
  PENDING: "bg-sa-dim/15 text-sa-dim",
  SIGNED_UP: "bg-sa-blue/15 text-sa-blue",
  CONVERTED: "bg-sa-teal/15 text-sa-teal",
  REWARDED: "bg-sa-green/15 text-sa-green",
}

export function ReferralsPanel({
  referrals,
  byReferrer,
  tiers,
  schools,
}: {
  referrals: ReferralRow[]
  byReferrer: ReferrerTotals[]
  tiers: ReadonlyArray<{ conversions: number; months: number }>
  schools: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [schoolId, setSchoolId] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState<string | null>(null)

  async function createCode() {
    if (!schoolId) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/growth/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not create a code.")
      setSchoolId("")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  async function advance(row: ReferralRow, status: Status) {
    let referredSchoolId: string | null | undefined
    if (status !== "PENDING" && !row.referredSchoolId) {
      const id = window.prompt("Which school signed up with this code? Paste its id.")
      if (!id) return
      referredSchoolId = id
    }

    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/growth/referrals/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, referredSchoolId }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not update the referral.")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-sa-border bg-sa-surface p-4">
        <h3 className="text-h3">Reward tiers</h3>
        <p className="mb-2 text-caption text-sa-dim">
          Free months are earned when the referred school CONVERTS to a paid plan, not when it signs
          up — a referral that churns during trial cost an acquisition rather than earning one.
        </p>
        <ul className="flex flex-wrap gap-2">
          {tiers.map((tier) => (
            <li
              key={tier.conversions}
              className="rounded-md border border-sa-border bg-sa-raised/40 px-3 py-1.5 text-body text-sa-muted"
            >
              <span className="font-mono tabular-nums text-sa-text">{tier.conversions}</span>{" "}
              conversion{tier.conversions === 1 ? "" : "s"} ={" "}
              <span className="font-mono tabular-nums text-sa-green">{tier.months}</span> free month
              {tier.months === 1 ? "" : "s"}
            </li>
          ))}
        </ul>
      </section>

      {error && <p className="text-body text-sa-red">{error}</p>}

      <section className="rounded-lg border border-sa-border bg-sa-surface p-4">
        <h3 className="text-h3">Issue a code</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={schoolId}
            onChange={(event) => setSchoolId(event.target.value)}
            aria-label="School to issue a referral code for"
            className="h-8 min-w-[260px] rounded-md border border-sa-border bg-sa-raised px-2 text-body text-sa-text focus:border-sa-blue focus:outline-none"
          >
            <option value="">Pick a school…</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!schoolId || busy}
            onClick={() => void createCode()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Generate code
          </button>
        </div>
      </section>

      {byReferrer.length > 0 && (
        <section className="rounded-lg border border-sa-border bg-sa-surface">
          <header className="border-b border-sa-border px-4 py-2.5">
            <h3 className="text-h3">By referrer</h3>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    School
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Codes
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Signed up
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Converted
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Months earned
                  </th>
                </tr>
              </thead>
              <tbody>
                {byReferrer.map((row) => (
                  <tr key={row.schoolId} className="border-b border-sa-border/60 last:border-0">
                    <td className="px-4 py-1.5">
                      <Link
                        href={`/console/schools/${row.schoolId}`}
                        className="text-sa-text hover:text-sa-blue"
                      >
                        {row.school}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-sa-muted">
                      {row.codes}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-sa-muted">
                      {row.signedUp}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-sa-text">
                      {row.converted}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-sa-green">
                      {row.earnedMonths}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-sa-border bg-sa-surface">
        <header className="border-b border-sa-border px-4 py-2.5">
          <h3 className="text-h3">Referrals</h3>
        </header>

        {referrals.length === 0 ? (
          <p className="px-4 py-10 text-center text-body text-sa-muted">No referral codes issued.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Referrer
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Code
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Referred school
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Reward
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Advance
                  </th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((row) => (
                  <tr key={row.id} className="border-b border-sa-border/60 last:border-0">
                    <td className="px-4 py-2">
                      <Link
                        href={`/console/schools/${row.referrerSchoolId}`}
                        className="text-sa-text hover:text-sa-blue"
                      >
                        {row.referrer}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(row.code)
                          setCopied(row.code)
                          window.setTimeout(() => setCopied(null), 1500)
                        }}
                        className="inline-flex items-center gap-1.5 font-mono text-body text-sa-text hover:text-sa-blue"
                      >
                        {row.code}
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        <span className="sr-only">Copy {row.code}</span>
                      </button>
                      {copied === row.code && (
                        <span className="ml-1.5 text-caption text-sa-green">copied</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sa-muted">
                      {row.referred ?? <span className="text-sa-disabled">not yet attributed</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex h-5 items-center rounded px-2 text-caption font-medium",
                          STATUS_STYLE[row.status],
                        )}
                      >
                        {row.status.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-sa-green">
                      {row.rewardMonths > 0 ? `${row.rewardMonths} mo` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1.5">
                        {(["SIGNED_UP", "CONVERTED", "REWARDED"] as const)
                          .filter((status) => status !== row.status)
                          .map((status) => (
                            <button
                              key={status}
                              type="button"
                              disabled={busy}
                              onClick={() => void advance(row, status)}
                              className="h-7 rounded-md border border-sa-border px-2 text-caption capitalize text-sa-muted transition-colors hover:text-sa-text disabled:opacity-50"
                            >
                              {status.replace(/_/g, " ").toLowerCase()}
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="border-t border-sa-border px-4 py-2 text-caption text-sa-dim">
          The reward column is recomputed from the referrer&rsquo;s converted count each time a
          referral moves, so un-converting one cannot leave a paid-out month behind. Totals across a
          referrer always equal the tier table.
        </p>
      </section>
    </div>
  )
}
