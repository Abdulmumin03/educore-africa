import { Sparkles, Send, AlertTriangle, FileText } from "lucide-react"
import { ScrollReveal } from "@/components/shared/scroll-reveal"

export function AIShowcase() {
  return (
    <section id="ai" className="relative overflow-hidden bg-navy py-20 text-white md:py-28">
      <div className="absolute inset-0 pattern-grid-warm opacity-30" />
      <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-amber-500/15 blur-3xl" />
      <div className="absolute left-0 bottom-0 h-96 w-96 rounded-full bg-orange-700/15 blur-3xl" />

      <div className="container relative">
        <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
          {/* Left: copy */}
          <ScrollReveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-3.5 py-1.5 text-xs font-medium uppercase tracking-wider text-amber-200">
              <Sparkles className="h-3.5 w-3.5" />
              Claude-powered intelligence
            </span>
            <h2 className="mt-6 text-3xl font-bold leading-tight tracking-tight md:text-5xl">
              Ask EduCore <span className="italic text-amber-300">anything</span>.
              <br />
              In plain English.
            </h2>
            <p className="mt-5 max-w-lg text-lg text-white/70">
              EduCore Intelligence uses Claude with safe tool use — not text-to-SQL — to
              answer questions about your school, flag risks before they bite, and write
              the boring stuff your admins hate.
            </p>

            <ul className="mt-7 space-y-3.5">
              {[
                {
                  title: "Ask EduCore",
                  body: "Natural-language Q&A with structured tool calls. Never sees your DB credentials.",
                },
                {
                  title: "Risk scoring",
                  body: "Per-student dropout & academic risk — refreshed nightly, surfaced on every profile.",
                },
                {
                  title: "Auto-generated comments",
                  body: "Term-end remarks per student, drafted from real grades & attendance. Editable, not robotic.",
                },
                {
                  title: "Lesson plan generator",
                  body: "Teachers describe the topic; EduCore drafts the plan, aligned to the curriculum on file.",
                },
              ].map((f) => (
                <li key={f.title} className="flex gap-3">
                  <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/15 ring-1 ring-amber-300/40">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                  </div>
                  <div>
                    <span className="font-semibold text-white">{f.title}</span>
                    <span className="text-white/65"> — {f.body}</span>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollReveal>

          {/* Right: mock chat */}
          <ScrollReveal delay={150} effect="scale" className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-amber-400/25 to-orange-500/20 blur-3xl" />
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a2350]/95 shadow-2xl ring-1 ring-white/5 backdrop-blur">
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.03] px-5 py-3.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-navy">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Ask EduCore</div>
                  <div className="text-[10px] text-white/50">claude-opus-4-7 · tool use enabled</div>
                </div>
              </div>

              {/* Conversation */}
              <div className="space-y-4 p-5">
                {/* User message */}
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-white/[0.08] px-4 py-2.5 text-sm">
                  Which JSS2 students missed fees AND have attendance below 85% this
                  term?
                </div>

                {/* AI tool call */}
                <div className="max-w-[92%]">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-200/80">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                    Tool · query_outstanding_fees · query_attendance
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-amber-400/[0.08] px-4 py-3.5 text-sm leading-relaxed ring-1 ring-amber-300/20">
                    <p className="text-white/90">
                      I found <span className="font-bold text-amber-200">5 students</span>{" "}
                      matching both criteria in JSS2 this term.
                    </p>
                    <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
                      <table className="w-full text-xs">
                        <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-white/50">
                          <tr>
                            <th className="px-3 py-1.5 text-left font-semibold">Student</th>
                            <th className="px-3 py-1.5 text-right font-semibold">Owed</th>
                            <th className="px-3 py-1.5 text-right font-semibold">Att.</th>
                          </tr>
                        </thead>
                        <tbody className="text-white/85">
                          {[
                            ["Tunde Bakare", "₦82,000", "78%"],
                            ["Aisha Sani", "₦125,000", "71%"],
                            ["Chinedu Okafor", "₦60,000", "83%"],
                            ["Fatima Lawal", "₦125,000", "80%"],
                            ["Emeka Nwosu", "₦42,000", "84%"],
                          ].map(([n, o, a]) => (
                            <tr
                              key={n}
                              className="border-t border-white/5 hover:bg-white/[0.03]"
                            >
                              <td className="px-3 py-1.5">{n}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-amber-200">
                                {o}
                              </td>
                              <td className="px-3 py-1.5 text-right">{a}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-3 text-white/80">
                      Want me to draft a parent SMS for all five and queue it for review?
                    </p>
                  </div>
                </div>

                {/* Input */}
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                  <input
                    disabled
                    placeholder="Ask anything about your school…"
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
                  />
                  <button className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-400 text-navy">
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Floating insight chips */}
            <div className="absolute -left-3 -top-4 hidden rotate-[-3deg] rounded-xl border border-amber-200/50 bg-amber-50 px-3 py-2 shadow-xl md:block">
              <div className="flex items-center gap-2 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                <span className="font-semibold text-amber-900">7 students at risk</span>
              </div>
            </div>
            <div className="absolute -bottom-3 -right-3 hidden rotate-[3deg] rounded-xl border border-emerald-200/50 bg-emerald-50 px-3 py-2 shadow-xl md:block">
              <div className="flex items-center gap-2 text-xs">
                <FileText className="h-3.5 w-3.5 text-emerald-700" />
                <span className="font-semibold text-emerald-900">238 remarks drafted</span>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
