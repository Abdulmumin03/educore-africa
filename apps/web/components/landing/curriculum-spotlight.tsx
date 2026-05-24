import { Check } from "lucide-react"
import { ScrollReveal } from "@/components/shared/scroll-reveal"

const streams = [
  {
    name: "WAEC stream",
    colour: "from-emerald-50 to-emerald-100/40",
    accent: "text-emerald-800",
    border: "border-emerald-200",
    badge: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    subjects: ["English Language", "Mathematics", "Civic Education", "Yoruba", "Biology"],
    scale: [
      ["A1", "75–100"],
      ["B2", "70–74"],
      ["B3", "65–69"],
      ["C4", "60–64"],
      ["…", "etc."],
    ],
    features: [
      "WAEC grading scale built-in",
      "Subject codes per curriculum (externalCode)",
      "Mock sheets in the WAEC format",
    ],
  },
  {
    name: "Cambridge stream",
    colour: "from-amber-50 to-orange-100/40",
    accent: "text-orange-900",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-900 ring-amber-200",
    subjects: ["English (0500)", "Mathematics (0580)", "Global Perspectives", "Coordinated Sci."],
    scale: [
      ["A*", "90–100"],
      ["A", "80–89"],
      ["B", "70–79"],
      ["C", "60–69"],
      ["…", "etc."],
    ],
    features: [
      "IGCSE / Checkpoint / O-Level scales",
      "Per-curriculum AI prompt hints for remarks",
      "Cambridge mock sheets in their layout",
    ],
  },
]

export function CurriculumSpotlight() {
  return (
    <section id="curriculum" className="relative bg-cream py-20 md:py-28">
      <div className="absolute inset-0 pattern-dots opacity-50" />
      <div className="container relative">
        <ScrollReveal>
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              Multi-curriculum, finally done right
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-navy md:text-5xl">
              Run WAEC and Cambridge{" "}
              <span className="italic text-amber-700">side by side.</span>
            </h2>
            <p className="mt-5 text-lg text-navy/65">
              Most platforms force you to pick one. EduCore lets each class belong to its
              own curriculum — with its own grading scale, AI prompt style, and report
              format. Switching a class is a setting, not a migration project.
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {streams.map((s, i) => (
            <ScrollReveal key={s.name} delay={i * 140} className="h-full">
            <div
              className={`relative h-full overflow-hidden rounded-2xl border ${s.border} bg-gradient-to-br ${s.colour} p-7 shadow-sm`}
            >
              <div className="flex items-center justify-between">
                <h3 className={`text-2xl font-bold ${s.accent}`}>{s.name}</h3>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${s.badge}`}
                >
                  Curriculum
                </span>
              </div>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-navy/55">
                    Sample subjects
                  </div>
                  <ul className="mt-2.5 space-y-1.5 text-sm text-navy">
                    {s.subjects.map((sub) => (
                      <li key={sub} className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-amber-700" />
                        {sub}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-navy/55">
                    Grading scale
                  </div>
                  <div className="mt-2.5 overflow-hidden rounded-lg border border-navy/10 bg-white/70">
                    <table className="w-full text-xs">
                      <tbody>
                        {s.scale.map(([g, r]) => (
                          <tr key={g} className="border-b border-navy/5 last:border-b-0">
                            <td className="px-3 py-1.5 font-mono font-semibold text-navy">
                              {g}
                            </td>
                            <td className="px-3 py-1.5 text-right text-navy/65">{r}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-1.5">
                {s.features.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm text-navy/75">
                    <span className="h-1 w-1 rounded-full bg-amber-700" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
            </ScrollReveal>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-navy/55">
          Need British, IB or a custom local curriculum? EduCore stores any grading scale
          and prompt style — just configure the Curriculum row.
        </p>
      </div>
    </section>
  )
}
