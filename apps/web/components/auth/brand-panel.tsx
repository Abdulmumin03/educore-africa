import { Sparkles, ShieldCheck, Globe2, Zap } from "lucide-react"
import { ScrollReveal } from "@/components/shared/scroll-reveal"

const points = [
  {
    icon: Sparkles,
    title: "Claude-powered intelligence",
    body: "Risk scoring, lesson plans, and term comments — without leaving the dashboard.",
  },
  {
    icon: Globe2,
    title: "Africa-first by design",
    body: "Paystack, USSD, and SMS that work even when the data network doesn't.",
  },
  {
    icon: Zap,
    title: "Offline-ready PWA",
    body: "Mark attendance and enter grades anywhere. Everything syncs when you're back online.",
  },
  {
    icon: ShieldCheck,
    title: "Multi-tenant security",
    body: "Row-level isolation per school. Your data never leaves your boundary.",
  },
]

export function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden rounded-3xl bg-navy text-white lg:flex lg:flex-col lg:p-10">
      <div className="absolute inset-0 pattern-grid-warm opacity-30" />
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />
      <div className="absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-orange-700/20 blur-3xl" />

      {/* Kente top stripe */}
      <div className="absolute inset-x-0 top-0 flex h-1.5 overflow-hidden">
        {[
          "#F59E0B", "#0D2B5E", "#C2410C", "#F59E0B", "#0D2B5E",
          "#B45309", "#F59E0B", "#0D2B5E", "#C2410C", "#F59E0B",
        ].map((c, i) => (
          <div key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>

      <div className="relative flex h-full flex-col">
        <ScrollReveal>
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-amber-300/30 bg-amber-400/10 px-3.5 py-1.5 text-xs font-medium uppercase tracking-wider text-amber-200">
            <Sparkles className="h-3.5 w-3.5" />
            EduCore Africa
          </span>
        </ScrollReveal>

        <ScrollReveal delay={80}>
          <h2 className="mt-6 text-3xl font-bold leading-tight tracking-tight md:text-4xl">
            Run a smarter school.{" "}
            <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
              From admissions to alumni.
            </span>
          </h2>
        </ScrollReveal>

        <ul className="mt-9 space-y-5">
          {points.map(({ icon: Icon, title, body }, i) => (
            <ScrollReveal key={title} delay={180 + i * 90}>
              <li className="flex gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300 ring-1 ring-amber-300/30">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-white">{title}</div>
                  <div className="text-sm text-white/65">{body}</div>
                </div>
              </li>
            </ScrollReveal>
          ))}
        </ul>

        {/* Floating stat card */}
        <ScrollReveal delay={620} effect="scale" className="mt-auto pt-10">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-200">
              Today across EduCore
            </div>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <div>
                <div className="text-xl font-bold text-white">238</div>
                <div className="text-[10px] uppercase tracking-wider text-white/55">
                  Reports sent
                </div>
              </div>
              <div>
                <div className="text-xl font-bold text-white">94.2%</div>
                <div className="text-[10px] uppercase tracking-wider text-white/55">
                  Attendance
                </div>
              </div>
              <div>
                <div className="text-xl font-bold text-amber-300">₦18.4M</div>
                <div className="text-[10px] uppercase tracking-wider text-white/55">
                  Fees collected
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-white/40">
            Made for Africa · Built with Claude
          </p>
        </ScrollReveal>
      </div>
    </aside>
  )
}
