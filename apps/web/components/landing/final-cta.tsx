import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { ScrollReveal } from "@/components/shared/scroll-reveal"

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden bg-navy py-20 text-white md:py-28">
      <div className="absolute inset-0 pattern-grid-warm opacity-40" />
      <div className="absolute inset-0 glow-amber" />

      {/* Kente stripes */}
      <div className="absolute inset-x-0 top-0 flex h-1.5 overflow-hidden">
        {[
          "#F59E0B", "#0D2B5E", "#C2410C", "#F59E0B", "#0D2B5E",
          "#B45309", "#F59E0B", "#0D2B5E", "#C2410C", "#F59E0B",
        ].map((c, i) => (
          <div key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex h-1.5 overflow-hidden">
        {[
          "#F59E0B", "#0D2B5E", "#C2410C", "#F59E0B", "#0D2B5E",
          "#B45309", "#F59E0B", "#0D2B5E", "#C2410C", "#F59E0B",
        ].map((c, i) => (
          <div key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>

      <div className="container relative text-center">
        <ScrollReveal effect="scale">
        <h2 className="mx-auto max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight md:text-6xl">
          Run your school like the{" "}
          <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
            best in Africa.
          </span>
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">
          Join the proprietors who decided spreadsheets, WhatsApp groups, and
          three different vendors were not a strategy. EduCore is.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link
            href="/onboard"
            className="group inline-flex items-center gap-2 rounded-lg bg-amber-400 px-7 py-4 text-base font-semibold text-navy shadow-xl shadow-amber-500/20 transition-all hover:bg-amber-300 hover:shadow-2xl"
          >
            Book a demo
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/[0.04] px-7 py-4 text-base font-semibold text-white backdrop-blur transition-all hover:bg-white/[0.08]"
          >
            Sign in
          </Link>
        </div>
        <p className="mt-7 text-xs uppercase tracking-[0.2em] text-white/45">
          Made for Africa · Built with Claude
        </p>
        </ScrollReveal>
      </div>
    </section>
  )
}
