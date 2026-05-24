import { ScrollReveal } from "@/components/shared/scroll-reveal"

const stats = [
  { value: "16", label: "Connected modules" },
  { value: "5+", label: "Payment rails" },
  { value: "2", label: "Curricula in parallel" },
  { value: "USSD", label: "Works on any phone" },
  { value: "Offline", label: "First-class PWA" },
]

export function StatsStrip() {
  return (
    <section className="relative overflow-hidden bg-navy py-12 text-white">
      <div className="absolute inset-0 pattern-grid-warm opacity-30" />
      {/* Kente stripe top */}
      <div className="absolute inset-x-0 top-0 flex h-1.5 overflow-hidden">
        {[
          "#F59E0B", "#0D2B5E", "#C2410C", "#F59E0B", "#0D2B5E",
          "#B45309", "#F59E0B", "#0D2B5E", "#C2410C", "#F59E0B",
        ].map((c, i) => (
          <div key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>
      <div className="container relative">
        <div className="grid grid-cols-2 gap-y-8 md:grid-cols-5">
          {stats.map((s, i) => (
            <ScrollReveal key={s.label} delay={i * 80} effect="scale">
              <div className="text-center">
                <div className="bg-gradient-to-br from-amber-300 to-orange-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-4xl">
                  {s.value}
                </div>
                <div className="mt-1 text-xs font-medium uppercase tracking-wider text-white/60">
                  {s.label}
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
