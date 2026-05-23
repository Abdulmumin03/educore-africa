"use client"

import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
    features: [
      "100 students",
      "Attendance & gradebook",
      "Email support",
      "Single school",
    ],
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div>
        <h2 className="text-xl font-semibold">Choose a plan</h2>
        <p className="text-sm text-muted-foreground">
          Start on Starter — upgrade any time as your school grows.
        </p>
      </div>

      <Controller
        control={control}
        name="plan"
        render={({ field }) => (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PLAN_CARDS.map((p) => {
              const active = field.value === p.key
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => field.onChange(p.key)}
                  className={cn(
                    "relative flex flex-col rounded-lg border p-5 text-left transition",
                    active
                      ? "border-primary bg-primary/5 ring-2 ring-primary"
                      : "border-muted hover:border-foreground/30",
                  )}
                >
                  {p.recommended && (
                    <Badge variant="default" className="absolute -top-2 right-4">
                      Recommended
                    </Badge>
                  )}
                  <div className="font-semibold">{p.name}</div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-bold">{p.price}</span>
                    <span className="text-xs text-muted-foreground">{p.cadence}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{p.tagline}</p>
                  <ul className="mt-4 space-y-1.5 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </button>
              )
            })}
          </div>
        )}
      />
      {errors.plan && <p className="text-sm text-destructive">{errors.plan.message}</p>}

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button type="submit">
          {selected === "STARTER" ? "Continue with Starter" : `Continue with ${PLAN_CARDS.find((p) => p.key === selected)?.name}`}
        </Button>
      </div>
    </form>
  )
}
