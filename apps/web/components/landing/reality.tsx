import { Phone, WifiOff, Banknote } from "lucide-react"
import { ScrollReveal } from "@/components/shared/scroll-reveal"

const realities = [
  {
    icon: Phone,
    problem: "Half of your parents don't open WhatsApp.",
    solution:
      "Parents can pay fees, check results and view attendance over plain SMS and USSD — no app, no data, no smartphone needed.",
    chip: "USSD · *347*88#",
  },
  {
    icon: WifiOff,
    problem: "Your teachers lose data when the internet drops.",
    solution:
      "EduCore is an offline-first PWA. Mark attendance, enter scores, run lessons — it all syncs the moment you're back online.",
    chip: "Offline-first PWA",
  },
  {
    icon: Banknote,
    problem: "Cash leaks. Receipts disappear. Reconciliation is chaos.",
    solution:
      "Paystack, Remita, Flutterwave, bank transfer, mobile money and cash — all flow into one ledger with idempotent webhooks.",
    chip: "5+ payment rails",
  },
]

export function Reality() {
  return (
    <section className="relative bg-cream py-20 md:py-28">
      <div className="absolute inset-0 pattern-dots opacity-50" />
      <div className="container relative">
        <ScrollReveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              Built for the realities of African schools
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-navy md:text-5xl">
              Most school software was built for{" "}
              <span className="italic text-amber-700">somewhere else</span>.
            </h2>
            <p className="mt-5 text-lg text-navy/65">
              EduCore is shaped by Lagos traffic, Harmattan power cuts, parents on feature
              phones, and proprietors who actually have to <em>collect</em> the fees.
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {realities.map(({ icon: Icon, problem, solution, chip }, i) => (
            <ScrollReveal key={problem} delay={i * 110}>
            <div
              className="group relative h-full overflow-hidden rounded-2xl border border-navy/10 bg-white p-7 shadow-sm transition-all hover:-translate-y-1 hover:border-amber-400/40 hover:shadow-xl"
            >
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-100/0 transition-colors group-hover:bg-amber-100/60" />
              <div className="relative">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-navy text-amber-300 ring-4 ring-amber-100/0 transition-all group-hover:ring-amber-100">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold leading-snug text-navy">
                  {problem}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-navy/65">{solution}</p>
                <span className="mt-5 inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                  {chip}
                </span>
              </div>
            </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
