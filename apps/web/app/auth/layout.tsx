import Link from "next/link"
import { BrandPanel } from "@/components/auth/brand-panel"

const kente = [
  "#F59E0B", "#0D2B5E", "#C2410C", "#F59E0B", "#0D2B5E",
  "#B45309", "#F59E0B", "#0D2B5E", "#C2410C", "#F59E0B",
]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-cream text-navy">
      {/* Kente top stripe */}
      <div className="flex h-1.5 w-full overflow-hidden">
        {kente.map((c, i) => (
          <div key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>

      {/* Subtle pattern */}
      <div className="pointer-events-none absolute inset-0 pattern-dots opacity-60" />

      <header className="relative">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-base font-extrabold text-white">
              E
            </span>
            <span className="text-base font-semibold tracking-tight text-navy">
              EduCore <span className="text-amber-600">Africa</span>
            </span>
          </Link>
          <Link
            href="/"
            className="text-xs font-medium uppercase tracking-wider text-navy/60 hover:text-navy"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="relative flex-1">
        <div className="container grid w-full items-stretch gap-8 py-8 md:py-12 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
          {/* Form column */}
          <div className="flex items-center">
            <div className="mx-auto w-full max-w-md lg:mx-0">{children}</div>
          </div>

          {/* Brand panel (lg+ only) */}
          <BrandPanel />
        </div>
      </main>

      <footer className="relative">
        <div className="container flex flex-col items-center justify-between gap-2 border-t border-navy/10 py-5 text-xs text-navy/55 sm:flex-row">
          <p>© {new Date().getFullYear()} EduCore Africa</p>
          <p className="uppercase tracking-[0.2em]">Made for Africa</p>
        </div>
      </footer>
    </div>
  )
}
