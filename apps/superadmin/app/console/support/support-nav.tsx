"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const TABS = [
  { href: "/console/support", label: "Ticket queue" },
  { href: "/console/support/sla", label: "SLA dashboard" },
  { href: "/console/support/health", label: "School health" },
  { href: "/console/support/broadcast", label: "Broadcast" },
]

export function SupportNav() {
  const pathname = usePathname()

  return (
    <nav className="mb-4 flex items-center gap-1 border-b border-sa-border" aria-label="Support sections">
      {TABS.map((tab) => {
        const active = tab.href === "/console/support" ? pathname === tab.href : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-[34px] items-center border-b-2 px-3 text-body transition-colors",
              active
                ? "border-sa-blue font-medium text-sa-text"
                : "border-transparent text-sa-muted hover:text-sa-text",
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
