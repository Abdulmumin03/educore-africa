"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import type { BillingCycle, SchoolPlan } from "@prisma/client"
import { Loader2 } from "lucide-react"

import { useToast } from "@/hooks/use-toast"
import { CYCLE_LABEL, PLAN_LABEL, PLAN_ORDER } from "@/lib/plans"
import { formatCurrency } from "@/lib/utils"

const CYCLES: BillingCycle[] = ["MONTHLY", "TERMLY", "ANNUAL"]

function monthly(amount: number, cycle: BillingCycle): number {
  return cycle === "MONTHLY" ? amount : cycle === "TERMLY" ? amount / 3 : amount / 12
}

export function ChangePlanForm({
  schoolId,
  current,
}: {
  schoolId: string
  current: {
    plan: SchoolPlan
    cycle: BillingCycle
    amount: number
    promoCode: string | null
    promoPercent: number | null
  } | null
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [plan, setPlan] = React.useState<SchoolPlan>(current?.plan ?? "STARTER")
  const [cycle, setCycle] = React.useState<BillingCycle>(current?.cycle ?? "TERMLY")
  const [amount, setAmount] = React.useState(String(current?.amount ?? 0))
  const [effectiveAt, setEffectiveAt] = React.useState("")
  const [promo, setPromo] = React.useState(current?.promoCode ?? "")
  const [promoPercent, setPromoPercent] = React.useState(String(current?.promoPercent ?? ""))
  const [pending, setPending] = React.useState(false)

  const numeric = Number(amount) || 0
  const preview = monthly(numeric, cycle)
  const currentMrr = current ? monthly(current.amount, current.cycle) : 0
  const delta = preview - currentMrr

  if (!current) {
    return (
      <section className="rounded-lg border border-sa-border bg-sa-surface px-4 py-4">
        <h2 className="text-h3">No subscription</h2>
        <p className="mt-1 text-body text-sa-muted">
          This school has no subscription record. Create one through{" "}
          <code className="tabular">POST /api/schools</code> when registering, or add the row
          directly — the console does not yet create subscriptions for existing schools.
        </p>
      </section>
    )
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      const response = await fetch(`/api/schools/${schoolId}/subscription`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          cycle,
          amount: numeric,
          effectiveAt: effectiveAt || undefined,
          promoCode: promo || "",
          promoPercent: promoPercent === "" ? 0 : Number(promoPercent),
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        toast({ variant: "destructive", title: "Could not update", description: payload.error })
        return
      }

      toast({
        title: "Subscription updated",
        description: "The school's admins have been notified in their own app.",
      })
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Could not reach the server" })
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="rounded-lg border border-sa-border bg-sa-surface">
      <header className="border-b border-sa-border px-4 py-2.5">
        <h2 className="text-h3">Change plan</h2>
        <p className="text-caption text-sa-dim">
          Saving notifies the school&apos;s admins and writes an audit entry.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-3 px-4 py-3">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">Plan</span>
          <select
            value={plan}
            onChange={(event) => setPlan(event.target.value as SchoolPlan)}
            className="mt-1 h-8 w-full rounded-md border border-sa-border-em bg-sa-base px-2 text-body text-sa-text focus:border-sa-blue focus:outline-none"
          >
            {PLAN_ORDER.map((value) => (
              <option key={value} value={value}>
                {PLAN_LABEL[value]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">Cycle</span>
            <select
              value={cycle}
              onChange={(event) => setCycle(event.target.value as BillingCycle)}
              className="mt-1 h-8 w-full rounded-md border border-sa-border-em bg-sa-base px-2 text-body text-sa-text focus:border-sa-blue focus:outline-none"
            >
              {CYCLES.map((value) => (
                <option key={value} value={value}>
                  {CYCLE_LABEL[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">
              Amount per cycle
            </span>
            <input
              type="number"
              min={0}
              step={100}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-sa-border-em bg-sa-base px-2 font-mono text-body text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">
            Effective date (optional)
          </span>
          <input
            type="date"
            value={effectiveAt}
            onChange={(event) => setEffectiveAt(event.target.value)}
            className="mt-1 h-8 w-full rounded-md border border-sa-border-em bg-sa-base px-2 font-mono text-body text-sa-text focus:border-sa-blue focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">Promo code</span>
            <input
              value={promo}
              onChange={(event) => setPromo(event.target.value.toUpperCase())}
              placeholder="EARLYBIRD24"
              className="mt-1 h-8 w-full rounded-md border border-sa-border-em bg-sa-base px-2 font-mono text-body uppercase text-sa-text placeholder:text-sa-dim focus:border-sa-blue focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">% off</span>
            <input
              type="number"
              min={0}
              max={100}
              value={promoPercent}
              onChange={(event) => setPromoPercent(event.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-sa-border-em bg-sa-base px-2 font-mono text-body text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>
        </div>

        <div className="rounded-md border border-sa-border bg-sa-base px-3 py-2">
          <p className="flex justify-between text-body">
            <span className="text-sa-muted">New monthly equivalent</span>
            <span className="tabular">{formatCurrency(preview)}</span>
          </p>
          <p className="mt-0.5 flex justify-between text-caption">
            <span className="text-sa-dim">Change to MRR</span>
            <span className={delta === 0 ? "tabular text-sa-dim" : delta > 0 ? "tabular text-sa-green" : "tabular text-sa-red"}>
              {delta > 0 ? "+" : ""}
              {formatCurrency(delta)}
            </span>
          </p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-sa-blue text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          Save change
        </button>
      </form>
    </section>
  )
}
