"use client"

import * as React from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check, Sparkles, TicketPercent } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import { cn } from "@/lib/utils"
import { stepPlanSchema, type StepPlanInput, PLANS } from "@/lib/auth-schemas"

type Plan = (typeof PLANS)[number]

type PlanCard = {
  key: Plan
  name: string
  price: string
  cadence: string
  tagline: string
  features: string[]
  recommended?: boolean
}

const PLAN_CARDS: PlanCard[] = [
  {
    key: "STARTER",
    name: "Starter",
    price: "₦0",
    cadence: "Free forever",
    tagline: "Up to 100 students. Get the basics running.",
    features: ["100 students", "Attendance & gradebook", "Email support", "Single school"],
  },
  {
    key: "GROWTH",
    name: "Growth",
    price: "₦25,000",
    cadence: "per term",
    tagline: "For growing schools that need fee billing.",
    features: [
      "500 students",
      "Paystack fee collection",
      "SMS & email notifications",
      "Library, hostel, transport",
    ],
    recommended: true,
  },
  {
    key: "PROFESSIONAL",
    name: "Professional",
    price: "₦60,000",
    cadence: "per term",
    tagline: "Multi-campus operations & analytics.",
    features: [
      "2,000 students",
      "Multiple campuses",
      "Advanced analytics",
      "Custom roles & SSO",
    ],
  },
  {
    key: "ENTERPRISE",
    name: "Enterprise",
    price: "Talk to us",
    cadence: "Custom",
    tagline: "Districts and large private groups.",
    features: [
      "Unlimited students",
      "Dedicated success manager",
      "Custom integrations",
      "On-prem option",
    ],
  },
]

type Props = {
  defaults?: StepPlanInput
  onBack: () => void
  onSubmit: (values: StepPlanInput) => void
}

export function StepPlan({ defaults, onBack, onSubmit }: Props) {
  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<StepPlanInput>({
    resolver: zodResolver(stepPlanSchema),
    defaultValues: defaults ?? { plan: "STARTER", promoCode: "" },
  })

  const selected = watch("plan")
  const promoCode = watch("promoCode")

  // Checked against the same validator the server runs at registration, so a
  // code that reads "valid" here cannot be refused a moment later.
  const [checking, setChecking] = React.useState(false)
  const [promoResult, setPromoResult] = React.useState<
    { ok: boolean; message: string } | null
  >(null)

  React.useEffect(() => {
    setPromoResult(null)
  }, [selected])

  async function checkPromo() {
    const code = (promoCode ?? "").trim()
    if (!code) return
    setChecking(true)
    setPromoResult(null)
    try {
      const response = await fetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, plan: selected }),
      })
      const body = (await response.json()) as {
        ok?: boolean
        message?: string
        amountOff?: number
        finalAmount?: number
        listPrice?: number
      }
      setPromoResult(
        body.ok
          ? {
              ok: true,
              message: `₦${(body.amountOff ?? 0).toLocaleString("en-NG")} off — you would pay ₦${(body.finalAmount ?? 0).toLocaleString("en-NG")} per term instead of ₦${(body.listPrice ?? 0).toLocaleString("en-NG")}.`,
            }
          : { ok: false, message: body.message ?? "That code cannot be used." },
      )
    } catch {
      setPromoResult({ ok: false, message: "Could not check that code just now." })
    } finally {
      setChecking(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-7" noValidate>
      <ScrollReveal>
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
            Step 4 of 5
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-navy md:text-3xl">
            Choose a plan
          </h2>
          <p className="mt-1.5 text-sm text-navy/65">
            Start on Starter — upgrade any time as your school grows.
          </p>
        </div>
      </ScrollReveal>

      <Controller
        control={control}
        name="plan"
        render={({ field }) => (
          <div className="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PLAN_CARDS.map((p, i) => {
              const active = field.value === p.key
              return (
                <ScrollReveal key={p.key} delay={i * 90} className="h-full">
                  <button
                    type="button"
                    onClick={() => field.onChange(p.key)}
                    className={cn(
                      "relative flex h-full w-full flex-col overflow-hidden rounded-2xl border p-5 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl",
                      active && p.recommended
                        ? "border-amber-400 bg-navy text-white ring-2 ring-amber-400"
                        : active
                          ? "border-amber-400 bg-amber-50/60 ring-1 ring-amber-300"
                          : p.recommended
                            ? "border-amber-200 bg-white"
                            : "border-navy/10 bg-white hover:border-navy/25",
                    )}
                  >
                    {p.recommended && (
                      <span className="absolute -top-2.5 right-4 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-navy shadow-sm">
                        <Sparkles className="h-3 w-3" />
                        Recommended
                      </span>
                    )}
                    <div
                      className={cn(
                        "text-sm font-bold uppercase tracking-wider",
                        active && p.recommended ? "text-amber-300" : "text-navy",
                      )}
                    >
                      {p.name}
                    </div>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span
                        className={cn(
                          "text-3xl font-bold",
                          active && p.recommended ? "text-white" : "text-navy",
                        )}
                      >
                        {p.price}
                      </span>
                      <span
                        className={cn(
                          "text-xs",
                          active && p.recommended ? "text-white/55" : "text-navy/55",
                        )}
                      >
                        {p.cadence}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "mt-2 text-xs",
                        active && p.recommended ? "text-white/65" : "text-navy/55",
                      )}
                    >
                      {p.tagline}
                    </p>
                    <ul className="mt-4 space-y-1.5 text-sm">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check
                            className={cn(
                              "mt-0.5 h-4 w-4 shrink-0",
                              active && p.recommended
                                ? "text-amber-300"
                                : "text-amber-700",
                            )}
                          />
                          <span
                            className={cn(
                              active && p.recommended ? "text-white/85" : "text-navy/75",
                            )}
                          >
                            {f}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </button>
                </ScrollReveal>
              )
            })}
          </div>
        )}
      />
      {errors.plan && <p className="text-sm text-destructive">{errors.plan.message}</p>}

      <ScrollReveal delay={380}>
        <div className="rounded-2xl border border-navy/10 bg-cream-soft/60 p-5">
          <label
            htmlFor="promoCode"
            className="flex items-center gap-2 text-sm font-semibold text-navy"
          >
            <TicketPercent className="h-4 w-4 text-amber-700" aria-hidden="true" />
            Have a promo code?
          </label>
          <p className="mt-1 text-xs text-navy/55">
            Optional. We will check it now so there are no surprises at the end.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Controller
              control={control}
              name="promoCode"
              render={({ field }) => (
                <input
                  id="promoCode"
                  {...field}
                  value={field.value ?? ""}
                  onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                  placeholder="TERM1-2026"
                  className="h-11 w-48 rounded-xl border border-navy/15 bg-white px-3 font-mono text-sm uppercase tracking-wide text-navy placeholder:text-navy/30 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              )}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!promoCode || checking}
              onClick={() => void checkPromo()}
              className="h-11 border-navy/15 text-navy hover:bg-white"
            >
              {checking ? "Checking…" : "Check code"}
            </Button>
            {promoResult && (
              <span
                className={cn(
                  "text-sm",
                  promoResult.ok ? "font-medium text-emerald-700" : "text-destructive",
                )}
              >
                {promoResult.message}
              </span>
            )}
          </div>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={400}>
        <div className="flex items-center justify-between border-t border-navy/10 pt-5">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="text-navy/65 hover:bg-cream-soft hover:text-navy"
          >
            ← Back
          </Button>
          <Button
            type="submit"
            className="h-11 bg-navy px-6 text-white hover:bg-[#0a2350]"
          >
            {selected === "STARTER"
              ? "Continue with Starter"
              : `Continue with ${PLAN_CARDS.find((p) => p.key === selected)?.name}`}{" "}
            →
          </Button>
        </div>
      </ScrollReveal>
    </form>
  )
}
