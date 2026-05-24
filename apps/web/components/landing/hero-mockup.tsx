import { Banknote, Sparkles, TrendingUp, Users, CheckCircle2 } from "lucide-react"

export function HeroMockup() {
  return (
    <div className="relative">
      {/* Floating glow behind */}
      <div className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-gradient-to-br from-amber-400/30 via-orange-400/20 to-amber-600/30 blur-3xl" />

      {/* Main dashboard card */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a2350]/95 p-5 shadow-2xl ring-1 ring-white/5 backdrop-blur">
        {/* Window chrome */}
        <div className="mb-4 flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-3 text-[10px] font-medium uppercase tracking-wider text-white/40">
            Greenfield Academy · Term 2
          </span>
        </div>

        <div className="grid gap-3">
          {/* Top stats row */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
                <Banknote className="h-3 w-3" />
                Fees collected
              </div>
              <div className="mt-1.5 text-lg font-bold text-white">₦18.4M</div>
              <div className="text-[10px] text-emerald-300">+12% vs last term</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
                <Users className="h-3 w-3" />
                Attendance
              </div>
              <div className="mt-1.5 text-lg font-bold text-white">94.2%</div>
              <div className="text-[10px] text-amber-300">3 absent today</div>
            </div>
            <div className="rounded-xl border border-amber-300/30 bg-gradient-to-br from-amber-400/15 to-orange-500/10 p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-200">
                <Sparkles className="h-3 w-3" />
                At risk
              </div>
              <div className="mt-1.5 text-lg font-bold text-white">7</div>
              <div className="text-[10px] text-amber-200/80">AI flagged · review now</div>
            </div>
          </div>

          {/* AI insight card */}
          <div className="rounded-xl border border-amber-300/20 bg-gradient-to-br from-amber-400/[0.08] via-transparent to-orange-500/[0.06] p-3.5">
            <div className="flex items-start gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400/20 ring-1 ring-amber-300/40">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-200">
                  EduCore Insight
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-white/85">
                  JSS2-B fee collection is{" "}
                  <span className="font-semibold text-amber-200">14% behind</span> last term.
                  3 families with siblings at the school account for ₦480k of the gap — send a
                  reminder?
                </p>
                <div className="mt-2 flex gap-1.5">
                  <button className="rounded-md bg-white text-[10px] font-semibold text-navy px-2.5 py-1">
                    Send SMS
                  </button>
                  <button className="rounded-md border border-white/15 text-[10px] font-medium text-white/80 px-2.5 py-1">
                    View list
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Attendance heatmap */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
                Attendance · last 14 days
              </div>
              <div className="flex items-center gap-1 text-[10px] text-emerald-300">
                <TrendingUp className="h-3 w-3" />
                Trending up
              </div>
            </div>
            <div className="flex gap-1">
              {[
                95, 92, 88, 94, 97, 90, 0, 96, 93, 91, 95, 98, 94, 0,
              ].map((v, i) => {
                const intensity = v === 0 ? 0 : (v - 85) / 13
                return (
                  <div
                    key={i}
                    className="h-8 flex-1 rounded-sm"
                    style={{
                      backgroundColor:
                        v === 0
                          ? "rgba(255,255,255,0.04)"
                          : `rgba(245, 158, 11, ${0.25 + intensity * 0.6})`,
                    }}
                  />
                )
              })}
            </div>
          </div>

          {/* Recent activity feed */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/60">
              Today
            </div>
            <ul className="space-y-1.5 text-[11px]">
              <li className="flex items-center gap-2 text-white/80">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                Paystack · ₦125,000 fee paid by Adeyemi A.
              </li>
              <li className="flex items-center gap-2 text-white/80">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                Bus 02 cleared geofence at Lekki Phase 1
              </li>
              <li className="flex items-center gap-2 text-white/80">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                238 parents notified · Mid-term report ready
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Floating side card — parent SMS preview */}
      <div className="absolute -left-6 bottom-12 hidden w-56 rotate-[-4deg] rounded-2xl border border-amber-200 bg-cream-soft p-3.5 shadow-2xl ring-1 ring-amber-200/40 sm:block">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500 text-[9px] font-bold text-white">
            SMS
          </span>
          To Mrs. Okafor
        </div>
        <p className="mt-2 text-xs leading-snug text-navy">
          Tunde marked <span className="font-semibold">present</span> · 7:48 AM ·
          Greenfield Academy
        </p>
        <p className="mt-1 text-[10px] text-navy/60">Reply STOP to opt out</p>
      </div>

      {/* Floating side card — USSD */}
      <div className="absolute -right-4 top-16 hidden w-44 rotate-[5deg] rounded-2xl border border-navy/15 bg-white p-3 shadow-2xl sm:block">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-navy/60">
            USSD
          </div>
          <span className="text-[10px] font-bold text-navy">*347*88#</span>
        </div>
        <div className="mt-2 rounded-lg bg-navy p-2.5 font-mono text-[10px] leading-relaxed text-amber-200">
          1. Pay fees<br />
          2. Check results<br />
          3. Attendance<br />
          4. Report card
        </div>
        <p className="mt-2 text-[9px] text-navy/50">Works on any phone · no data</p>
      </div>
    </div>
  )
}
