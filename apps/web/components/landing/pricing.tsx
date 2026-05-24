import Link from "next/link"
import { Check, Sparkles } from "lucide-react"
import { ScrollReveal } from "@/components/shared/scroll-reveal"

const tiers = [
  {
    name: "Starter",
    tagline: "For a single school finding its footing.",
    features: [
      "Up to 500 students",
      "All core modules (admissions → reports)",
      "Paystack + bank transfer",
      "Bulk SMS via your AT credits",
      "PWA + offline-ready",
      "Email support",
    ],
    cta: "Contact us",
    href: "/onboard",
    featured: false,
  },
  {
    name: "Growth",
    tagline: "For established schools running every module.",
    features: [
      "Up to 2,500 students",
      "Everything in Starter, plus:",
      "AI Intelligence Suite (Ask EduCore, risk scoring)",
      "Multi-curriculum (WAEC + Cambridge)",
      "Custom report templates",
      "WhatsApp templates",
      "Priority support + SLA",
    ],
    cta: "Talk to sales",
    href: "/onboard",
    featured: true,
  },
  {
    name: "Network",
    tagline: "For groups, federations, and franchises.",
    features: [
      "Unlimited students",
      "Everything in Growth, plus:",
      "Multi-school network dashboard",
      "Executive analytics across schools",
      "Audit log exports & compliance",
      "Dedicated success manager",
      "Onboarding & training included",
    ],
    cta: "Book a strategy call",
    href: "/onboard",
    featured: false,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="relative bg-cream py-20 md:py-28">
      <div className="container relative">
        <ScrollReveal>
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              Pricing
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-navy md:text-5xl">
              One school or fifty —{" "}
              <span className="italic text-amber-700">we scale with you</span>.
            </h2>
            <p className="mt-5 text-lg text-navy/65">
              Pricing is calibrated per school size and module mix. Tell us about your
              school and we&apos;ll send a fitted quote within a working day.
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-14 grid items-stretch gap-5 md:grid-cols-3">
          {tiers.map((t, i) => (
            <ScrollReveal key={t.name} delay={i * 110} className="h-full">
            <div
              className={`relative flex h-full flex-col rounded-2xl border p-7 transition-all ${
                t.featured
                  ? "border-amber-400 bg-navy text-white shadow-2xl md:-translate-y-2"
                  : "border-navy/10 bg-white shadow-sm hover:-translate-y-1 hover:shadow-xl"
              }`}
            >
              {t.featured && (
                <>
                  <div className="absolute inset-0 pattern-grid-warm opacity-30" />
                  <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-navy shadow-md">
                    <Sparkles className="h-3 w-3" />
                    Most popular
                  </span>
                </>
              )}
              <div className="relative">
                <h3
                  className={`text-2xl font-bold ${
                    t.featured ? "text-white" : "text-navy"
                  }`}
                >
                  {t.name}
                </h3>
                <p
                  className={`mt-1 text-sm ${
                    t.featured ? "text-white/65" : "text-navy/60"
                  }`}
                >
                  {t.tagline}
                </p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span
                    className={`text-4xl font-bold ${
                      t.featured ? "text-amber-300" : "text-navy"
                    }`}
                  >
                    Custom
                  </span>
                  <span
                    className={`text-sm ${
                      t.featured ? "text-white/55" : "text-navy/50"
                    }`}
                  >
                    / school / term
                  </span>
                </div>

                <ul className="mt-6 space-y-2.5">
                  {t.features.map((f) => (
                    <li
                      key={f}
                      className={`flex items-start gap-2 text-sm ${
                        t.featured ? "text-white/85" : "text-navy/75"
                      }`}
                    >
                      <Check
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          t.featured ? "text-amber-300" : "text-amber-700"
                        }`}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <Link
                href={t.href}
                className={`relative mt-7 inline-flex w-full items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition-all ${
                  t.featured
                    ? "bg-amber-400 text-navy hover:bg-amber-300"
                    : "border border-navy/15 text-navy hover:bg-navy hover:text-white"
                }`}
              >
                {t.cta}
              </Link>
            </div>
            </ScrollReveal>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-navy/55">
          Schools below 200 students may qualify for our community programme. Ask us.
        </p>
      </div>
    </section>
  )
}
