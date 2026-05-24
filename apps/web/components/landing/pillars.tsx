import {
  Banknote,
  Sparkles,
  MessageSquare,
  GraduationCap,
  Bus,
  Network,
} from "lucide-react"
import { ScrollReveal } from "@/components/shared/scroll-reveal"

const pillars = [
  {
    icon: Banknote,
    title: "Smart Finance",
    tag: "Get paid. Faster.",
    blurb:
      "Term- or year-scoped fee structures, automatic sibling/scholarship discounts, Paystack + USSD + bank transfer all reconciling into one ledger. Parents pay from a link sent over SMS — no login.",
    bullets: [
      "Fee structures per class, term or year",
      "Automatic discount engine (pickStudentDiscount)",
      "Paystack webhook · idempotent on payment.reference",
      "Parent pay portal at /pay/[invoiceId]",
      "Invoices, receipts, dunning & ageing reports",
    ],
  },
  {
    icon: Sparkles,
    title: "AI Intelligence",
    tag: "Powered by Claude.",
    blurb:
      "Ask EduCore answers questions in plain English using safe tool use — never raw SQL. Risk scoring flags students before they drop out. Lesson plans and report-card comments in seconds.",
    bullets: [
      "Ask EduCore — natural-language Q&A via tool use",
      "Dropout & academic risk scoring",
      "Lesson-plan generator (fast model)",
      "Term-end comments per student",
      "Heuristic fallbacks when AI is offline",
      "Redis-cached insights (6h) & remarks (7d)",
    ],
    featured: true,
  },
  {
    icon: MessageSquare,
    title: "Communication Hub",
    tag: "Reach every parent.",
    blurb:
      "Bulk SMS via Africa's Talking, WhatsApp templates, in-app announcements with channel preferences, and a public notice board. Two-step confirmation on emergency alerts so nobody panics by accident.",
    bullets: [
      "Bulk SMS with SmsBatch + per-recipient SmsLog",
      "WhatsApp template registry",
      "Emergency alerts with confirm-twice safety",
      "Announcement channels respect user prefs",
      "Public /notice-board for community broadcasts",
    ],
  },
  {
    icon: GraduationCap,
    title: "Academics & Reports",
    tag: "WAEC + Cambridge in one place.",
    blurb:
      "Run a WAEC stream and a Cambridge/IGCSE/Checkpoint stream side by side. Per-curriculum grading scales, midterm + end-of-term reports, custom-branded templates, and parent share links via opaque tokens.",
    bullets: [
      "Multi-curriculum (WAEC + Cambridge / IGCSE / Checkpoint)",
      "Per-curriculum grading scales & AI prompt hints",
      "CA components stored per-grade as JSON",
      "Midterm reports — comments + lock workflow",
      "Custom report templates (colours, sections, signatures)",
      "Parent share via /report-cards/[token]",
    ],
  },
  {
    icon: Bus,
    title: "Operations",
    tag: "Run the whole campus.",
    blurb:
      "Attendance with auto-SMS to parents, library with fines, hostel→dorm→room, GPS-tracked transport with geofence + near-stop SMS, and A6 QR visitor badges. Background workers handle the heavy lifting.",
    bullets: [
      "Attendance + automatic parent SMS",
      "Library with configurable fine rate",
      "Hostel → Dorm → Room layered (optional)",
      "Live GPS · Redis+DB dual-write · geofence",
      "Near-stop SMS for transport boarding",
      "A6 visitor badge PDF with QR scan-out",
      "Exeat state machine with OTP SMS",
    ],
  },
  {
    icon: Network,
    title: "Admin & Network",
    tag: "From one school to fifty.",
    blurb:
      "Multi-school networks with a group dashboard. Exec analytics, audit logs, role-based permissions, full PWA with offline queue, USSD menus per school slug — and a dispatcher for 6 analytics tabs.",
    bullets: [
      "Multi-school network dashboard",
      "Executive 5-min cached analytics",
      "Audit log (explicit calls, not middleware)",
      "Read-only permission matrix",
      "PWA + IndexedDB offline queue + SyncManager",
      "USSD per school via School.ussdCode",
    ],
  },
]

export function Pillars() {
  return (
    <section id="pillars" className="relative bg-cream-soft py-20 md:py-28">
      <div className="container">
        <ScrollReveal>
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              The platform
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-navy md:text-5xl">
              Six pillars. One system.{" "}
              <span className="italic text-amber-700">No spreadsheets.</span>
            </h2>
            <p className="mt-5 text-lg text-navy/65">
              EduCore replaces a stack of disconnected tools with one platform built
              specifically for African school operations — designed to feel native, not
              translated.
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {pillars.map(({ icon: Icon, title, tag, blurb, bullets, featured }, i) => (
            <ScrollReveal key={title} delay={i * 90} className="h-full">
            <div
              className={`group relative h-full overflow-hidden rounded-2xl border p-7 transition-all hover:-translate-y-1 hover:shadow-2xl ${
                featured
                  ? "border-amber-400/40 bg-navy text-white shadow-xl lg:row-span-1"
                  : "border-navy/10 bg-white shadow-sm hover:border-amber-400/40"
              }`}
            >
              {featured && (
                <div className="absolute inset-0 pattern-grid-warm opacity-30" />
              )}
              <div className="relative">
                <div
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${
                    featured
                      ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-300/40"
                      : "bg-navy text-amber-300"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-5 flex items-baseline gap-2">
                  <h3
                    className={`text-xl font-bold ${
                      featured ? "text-white" : "text-navy"
                    }`}
                  >
                    {title}
                  </h3>
                </div>
                <p
                  className={`mt-0.5 text-xs font-semibold uppercase tracking-wider ${
                    featured ? "text-amber-300" : "text-amber-700"
                  }`}
                >
                  {tag}
                </p>
                <p
                  className={`mt-4 text-sm leading-relaxed ${
                    featured ? "text-white/80" : "text-navy/70"
                  }`}
                >
                  {blurb}
                </p>
                <ul className="mt-5 space-y-1.5">
                  {bullets.map((b) => (
                    <li
                      key={b}
                      className={`flex items-start gap-2 text-xs leading-relaxed ${
                        featured ? "text-white/75" : "text-navy/70"
                      }`}
                    >
                      <span
                        className={`mt-1 h-1 w-1 shrink-0 rounded-full ${
                          featured ? "bg-amber-300" : "bg-amber-600"
                        }`}
                      />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
