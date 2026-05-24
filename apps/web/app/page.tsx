import { LandingNav } from "@/components/landing/nav"
import { Hero } from "@/components/landing/hero"
import { TrustStrip } from "@/components/landing/trust-strip"
import { Reality } from "@/components/landing/reality"
import { Pillars } from "@/components/landing/pillars"
import { AIShowcase } from "@/components/landing/ai-showcase"
import { CurriculumSpotlight } from "@/components/landing/curriculum-spotlight"
import { StatsStrip } from "@/components/landing/stats-strip"
import { HowItWorks } from "@/components/landing/how-it-works"
import { Pricing } from "@/components/landing/pricing"
import { FAQ } from "@/components/landing/faq"
import { FinalCTA } from "@/components/landing/final-cta"
import { Footer } from "@/components/landing/footer"

export const metadata = {
  title: "EduCore Africa — Run a smarter school. From admissions to alumni.",
  description:
    "AI-powered, multi-tenant school management built for African K-12. 16 connected modules, Africa-first payments (Paystack, USSD, mobile money), WAEC + Cambridge in parallel, offline-first PWA.",
}

export default function Home() {
  return (
    <main className="min-h-screen bg-cream text-navy">
      <LandingNav />
      <Hero />
      <TrustStrip />
      <Reality />
      <Pillars />
      <AIShowcase />
      <CurriculumSpotlight />
      <StatsStrip />
      <HowItWorks />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  )
}
