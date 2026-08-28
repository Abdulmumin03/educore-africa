"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const TABS = [
  { href: "/console/users", label: "School users" },
  { href: "/console/users/staff", label: "Console staff" },
  { href: "/console/users/anomalies", label: "Login anomalies" },
]

export function UsersNav() {
  const pathname = usePathname()

  return (
    <nav className="mb-4 flex items-center gap-1 border-b border-sa-border" aria-label="User sections">
      {TABS.map((tab) => {
        const active = tab.href === "/console/users" ? pathname === tab.href : pathname.startsWith(tab.href)
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
