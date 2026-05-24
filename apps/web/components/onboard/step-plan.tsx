"use client"

import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check, Sparkles } from "lucide-react"
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
    defaultValues: defaults ?? { plan: "STARTER" },
  })

  const selected = watch("plan")

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
