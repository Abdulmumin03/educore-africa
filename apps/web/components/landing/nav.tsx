"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Menu, X } from "lucide-react"

const links = [
  { href: "#pillars", label: "Features" },
  { href: "#ai", label: "AI" },
  { href: "#curriculum", label: "Curriculum" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
]

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-[#0D2B5E]/10 bg-[#FBF7EC]/85 backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <nav className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-base font-extrabold transition-colors ${
              scrolled ? "bg-navy text-white" : "bg-amber-400 text-navy"
            }`}
          >
            E
          </span>
          <span
            className={`text-base font-semibold tracking-tight transition-colors ${
              scrolled ? "text-navy" : "text-white"
            }`}
          >
            EduCore{" "}
            <span className={scrolled ? "text-amber-600" : "text-amber-300"}>
              Africa
            </span>
          </span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`text-sm font-medium transition-colors ${
                scrolled
                  ? "text-[#0D2B5E]/75 hover:text-navy"
                  : "text-white/85 hover:text-white"
              }`}
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/auth/login"
            className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
              scrolled
                ? "text-navy hover:bg-[#0D2B5E]/5"
                : "text-white hover:bg-white/10"
            }`}
          >
            Sign in
          </Link>
          <Link
            href="/onboard"
            className={`rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition-all hover:shadow-md ${
              scrolled
                ? "bg-navy text-white hover:bg-[#0a2350]"
                : "bg-amber-400 text-navy hover:bg-amber-300"
            }`}
          >
            Book a demo
          </Link>
        </div>

        <button
          aria-label="Toggle menu"
          className={`rounded-md p-2 transition-colors md:hidden ${
            scrolled ? "text-navy" : "text-white"
          }`}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-[#0D2B5E]/10 bg-[#FBF7EC] px-4 py-4 md:hidden">
          <div className="flex flex-col gap-2">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-navy hover:bg-[#0D2B5E]/5"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex gap-2">
              <Link
                href="/auth/login"
                className="flex-1 rounded-md border border-navy/20 px-4 py-2 text-center text-sm font-medium text-navy"
              >
                Sign in
              </Link>
              <Link
                href="/onboard"
                className="flex-1 rounded-md bg-navy px-4 py-2 text-center text-sm font-semibold text-white"
              >
                Book a demo
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
