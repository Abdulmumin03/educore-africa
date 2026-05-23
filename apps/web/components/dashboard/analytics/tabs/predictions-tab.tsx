"use client"

import {
  EmptyBlock,
  LoadingBlock,
  SectionCard,
  useAnalytics,
} from "../primitives"

type Data = {
  atRiskByClass: {
    classId: string
    name: string
    high: number
    medium: number
    low: number
  }[]
  defaultRisk: {
    classId: string
    name: string
    ratePct: number
    outstanding: number
    openInvoices: number
  }[]
}

const money = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
})

export function PredictionsTab({ from, to }: { from: string; to: string }) {
  const q = useAnalytics<Data>("predictions", from, to)
  if (q.isLoading) return <LoadingBlock />
  const data = q.data
  if (!data || (data.atRiskByClass.length === 0 && data.defaultRisk.length === 0)) {
    return (
      <EmptyBlock message="No AI predictions or open invoices yet — run risk scoring from the AI page." />
    )
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <SectionCard
        title="At-risk students per class"
        hint="Highest first; based on latest risk score per student"
      >
        {data.atRiskByClass.length === 0 ? (
          <p className="text-xs text-muted-foreground">No risk scores computed yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.atRiskByClass.map((c) => {
              const total = c.high + c.medium + c.low
              return (
                <li key={c.classId} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground">{total} scored</span>
                  </div>
                  <div className="flex h-1.5 overflow-hidden rounded">
                    {total > 0 ? (
                      <>
                        <div
                          className="bg-red-500"
                          style={{ width: `${(c.high / total) * 100}%` }}
                          title={`${c.high} high`}
                        />
                        <div
                          className="bg-amber-500"
                          style={{ width: `${(c.medium / total) * 100}%` }}
                          title={`${c.medium} medium`}
                        />
                        <div
                          className="bg-emerald-500"
                          style={{ width: `${(c.low / total) * 100}%` }}
                          title={`${c.low} low`}
                        />
                      </>
                    ) : null}
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span className="text-red-700">{c.high} high</span>
                    <span className="text-amber-700">{c.medium} medium</span>
                    <span className="text-emerald-700">{c.low} low</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Payment default risk"
        hint="Classes with the lowest collection so far"
      >
        {data.defaultRisk.length === 0 ? (
          <p className="text-xs text-muted-foreground">All open invoices are on track.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.defaultRisk.map((c) => (
              <li
                key={c.classId}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.openInvoices} open invoice{c.openInvoices === 1 ? "" : "s"} ·{" "}
                    {money.format(c.outstanding)} outstanding
                  </p>
                </div>
                <span
                  className={
                    c.ratePct < 50
                      ? "text-sm font-semibold text-red-700"
                      : c.ratePct < 75
                        ? "text-sm font-semibold text-amber-700"
                        : "text-sm font-semibold text-emerald-700"
                  }
                >
                  {c.ratePct}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Predicted exam pass rates" className="lg:col-span-2">
        <p className="text-sm text-muted-foreground">
          Deferred — needs a trained per-subject model. Today&apos;s rolling pass rates
          live on the AI insights endpoint; tap into{" "}
          <a className="underline" href="/dashboard/ai">
            /dashboard/ai
          </a>{" "}
          for live risk snapshots.
        </p>
      </SectionCard>
    </div>
  )
}
