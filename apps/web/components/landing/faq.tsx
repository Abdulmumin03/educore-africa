"use client"

import { useState } from "react"
import { Plus, Minus } from "lucide-react"
import { ScrollReveal } from "@/components/shared/scroll-reveal"

const faqs = [
  {
    q: "What happens when the internet goes down?",
    a: "EduCore is a Progressive Web App with an offline queue. Teachers can mark attendance, enter grades, run lessons, and access resources offline — everything syncs automatically when the connection returns. Critical parent communications fall back to SMS via Africa's Talking, and parents can transact over USSD using *347*88# even without data.",
  },
  {
    q: "Which payment methods do you support?",
    a: "Paystack (card, bank transfer, USSD), Remita, Flutterwave, direct bank transfer, mobile money, and cash receipts entered by your bursar. Every channel writes into one ledger, and Paystack webhooks are idempotent on payment reference — so a parent retrying never creates a double receipt.",
  },
  {
    q: "Can I run WAEC and Cambridge in the same school?",
    a: "Yes. EduCore was built for this. Each class belongs to a Curriculum, and each Curriculum has its own grading scale, subjects, AI prompt style, and report-card template. A British international section and a WAEC section coexist in the same school without compromise.",
  },
  {
    q: "Who owns the data?",
    a: "You do. EduCore is multi-tenant with row-level isolation by schoolId — no school can see another's data. You can export students, grades, finances, and audit logs at any time. We are GDPR- and NDPR-conscious in our processing.",
  },
  {
    q: "How does the AI access our data safely?",
    a: "Ask EduCore uses Claude with structured tool calls — the model can only query through a fixed set of tools we expose, never raw SQL. Sensitive information (PII, financial detail) is scoped to the asking user's permissions. Insights are cached in Redis for 6 hours and remarks for 7 days to keep costs predictable.",
  },
  {
    q: "How long does onboarding take?",
    a: "Most schools are running real workflows within two weeks. You can spin up an account in under 30 minutes, import students from CSV the same day, and roll out attendance and parent SMS by week one. Our Growth and Network plans include guided onboarding.",
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-navy/10 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-4 py-5 text-left"
      >
        <span className="text-base font-semibold text-navy md:text-lg">{q}</span>
        <span
          className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
            open ? "bg-amber-100 text-amber-800" : "bg-navy/5 text-navy/60"
          }`}
        >
          {open ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </span>
      </button>
      <div
        className={`grid transition-all duration-300 ${
          open ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <p className="max-w-3xl pr-10 text-sm leading-relaxed text-navy/70 md:text-base">
            {a}
          </p>
        </div>
      </div>
    </div>
  )
}

export function FAQ() {
  return (
    <section id="faq" className="bg-cream-soft py-20 md:py-28">
      <div className="container">
        <div className="grid gap-12 md:grid-cols-[1fr_1.4fr]">
          <ScrollReveal>
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                FAQ
              </span>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-navy md:text-4xl">
                Questions, before you ask.
              </h2>
              <p className="mt-5 text-base text-navy/65">
                These are the six questions every proprietor asks us within the first
                ten minutes of a demo.
              </p>
            </div>
          </ScrollReveal>
          <div>
            {faqs.map((f, i) => (
              <ScrollReveal key={f.q} delay={i * 60}>
                <FaqItem q={f.q} a={f.a} />
              </ScrollReveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
