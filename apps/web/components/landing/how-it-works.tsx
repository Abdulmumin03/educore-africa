import { ArrowRight } from "lucide-react"
import { ScrollReveal } from "@/components/shared/scroll-reveal"

const steps = [
  {
    num: "01",
    title: "Onboard your school",
    body: "Pick a slug, upload your logo, choose your curriculum, set your terms. EduCore is ready in under 30 minutes — no IT team required.",
    chip: "30 minutes",
  },
  {
    num: "02",
    title: "Bring in your data",
    body: "Import students, parents, staff and fee structures from CSV — or use the guided wizard. We handle multi-curriculum subjects and class assignment.",
    chip: "Wizard + CSV",
  },
  {
    num: "03",
    title: "Go live",
    body: "Assign roles, send parents a single SMS with their personal pay & report-card link, and switch on attendance. Everything else builds from there.",
    chip: "One SMS to parents",
  },
]

export function HowItWorks() {
  return (
    <section className="bg-cream-soft py-20 md:py-28">
      <div className="container">
        <ScrollReveal>
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              Onboarding
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-navy md:text-5xl">
              Live in a fortnight.{" "}
              <span className="italic text-amber-700">Not a year.</span>
            </h2>
            <p className="mt-5 text-lg text-navy/65">
              EduCore is opinionated about defaults so onboarding doesn&apos;t become a
              consulting project. Most schools are running real workflows within two weeks.
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <ScrollReveal key={s.num} delay={i * 120} className="h-full">
            <div
              className="relative h-full overflow-hidden rounded-2xl border border-navy/10 bg-white p-7 shadow-sm"
            >
              <div className="absolute right-4 top-4 text-7xl font-extrabold text-amber-100">
                {s.num}
              </div>
              <div className="relative">
                <div className="inline-flex h-8 items-center rounded-full bg-amber-100 px-3 text-xs font-semibold uppercase tracking-wider text-amber-800 ring-1 ring-amber-200">
                  Step {i + 1} · {s.chip}
                </div>
                <h3 className="mt-5 text-xl font-bold text-navy">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-navy/65">{s.body}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="absolute right-0 top-1/2 hidden -translate-y-1/2 translate-x-1/2 items-center justify-center md:flex">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-amber-300 ring-4 ring-cream-soft">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              )}
            </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
