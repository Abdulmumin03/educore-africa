import { ScrollReveal } from "@/components/shared/scroll-reveal"

const partners = [
  "Paystack",
  "Africa's Talking",
  "Anthropic Claude",
  "WAEC",
  "Cambridge",
  "Resend",
]

export function TrustStrip() {
  return (
    <section className="border-y border-navy/10 bg-cream-soft py-10">
      <div className="container">
        <ScrollReveal effect="fade">
          <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-navy/50">
            Built on the rails African schools already trust
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {partners.map((p, i) => (
              <span
                key={p}
                style={{ animationDelay: `${i * 60}ms` }}
                className="text-base font-semibold tracking-tight text-navy/55 transition-colors hover:text-navy"
              >
                {p}
              </span>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
