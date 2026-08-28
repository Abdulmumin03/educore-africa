"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"
import { AUDIT_TABS, type AuditTab } from "./tabs"

export function AuditNav({ active }: { active: AuditTab }) {
  const pathname = usePathname()
  const params = useSearchParams()

  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 border-b border-sa-border" aria-label="Audit sections">
      {AUDIT_TABS.map((tab) => {
        const next = new URLSearchParams(params.toString())
        next.set("tab", tab.key)
        const isActive = tab.key === active

        return (
          <Link
            key={tab.key}
            href={`${pathname}?${next.toString()}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-[34px] items-center border-b-2 px-3 text-body transition-colors",
              isActive
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
