import Link from "next/link"
import { ArrowRight, PlayCircle, Sparkles } from "lucide-react"
import { HeroMockup } from "./hero-mockup"

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-navy pt-24 text-white">
      {/* Background layers */}
      <div className="absolute inset-0 pattern-grid-warm opacity-50" />
      <div className="absolute inset-0 glow-amber" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-[#FBF7EC]" />

      {/* Decorative kente strip */}
      <div className="absolute inset-x-0 top-16 flex h-1.5 overflow-hidden opacity-60">
        {[
          "#F59E0B", "#0D2B5E", "#C2410C", "#F59E0B", "#0D2B5E",
          "#B45309", "#F59E0B", "#0D2B5E", "#C2410C", "#F59E0B",
        ].map((c, i) => (
          <div key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>

      <div className="container relative grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-28">
        {/* Left: copy */}
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-3.5 py-1.5 text-xs font-medium uppercase tracking-wider text-amber-200">
            <Sparkles className="h-3.5 w-3.5" />
            Built for African schools
          </span>

          <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
            Run a smarter school.
            <br />
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 bg-clip-text text-transparent">
              From admissions to alumni.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg text-white/75 sm:text-xl">
            Sixteen connected modules. Africa-first payments. AI that thinks like your
            sharpest administrator. Works offline — even on a feature phone over USSD.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/onboard"
              className="group inline-flex items-center gap-2 rounded-lg bg-amber-400 px-6 py-3.5 text-sm font-semibold text-navy shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-300 hover:shadow-xl hover:shadow-amber-500/30"
            >
              Start free trial
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="#pillars"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition-all hover:bg-white/[0.08]"
            >
              <PlayCircle className="h-4 w-4" />
              See the dashboard
            </Link>
          </div>

          {/* Tiny trust line */}
          <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/55">
            <span className="font-semibold uppercase tracking-wider text-white/70">
              Powered by
            </span>
            <span>Claude</span>
            <span className="h-1 w-1 rounded-full bg-white/30" />
            <span>Paystack</span>
            <span className="h-1 w-1 rounded-full bg-white/30" />
            <span>Africa&apos;s Talking</span>
            <span className="h-1 w-1 rounded-full bg-white/30" />
            <span>WAEC + Cambridge ready</span>
          </div>
        </div>

        {/* Right: mockup */}
        <div className="relative animate-fade-up pl-2 [animation-delay:120ms]">
          <HeroMockup />
        </div>
      </div>
    </section>
  )
}
