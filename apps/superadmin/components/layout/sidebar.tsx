"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { GraduationCap, LogOut } from "lucide-react"

import { cn } from "@/lib/utils"
import { NAV_GROUPS, type NavItem } from "@/components/layout/nav"
import type { ConsoleSection } from "@/lib/permissions"
import type { ConsoleUser } from "@/lib/session-guard"
import { signOutAction } from "@/app/console/actions"

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center rounded-md px-3 text-body transition-colors",
        // The active rail is an inset shadow rather than a border so the
        // label never shifts 2px when a link becomes active.
        active
          ? "bg-sa-blue/10 font-medium text-sa-blue shadow-[inset_2px_0_0_theme(colors.sa.blue)]"
          : "text-sa-muted hover:bg-sa-raised hover:text-sa-text",
      )}
    >
      <item.icon className="mr-3 h-4 w-4 shrink-0" aria-hidden="true" />
      {item.label}
    </Link>
  )
}

export function Sidebar({
  sections,
  user,
}: {
  sections: ConsoleSection[]
  user: ConsoleUser
}) {
  const pathname = usePathname()
  const allowed = new Set(sections)

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-sidebar flex-col border-r border-sa-border bg-sa-base">
      {/* Wordmark */}
      <div className="flex h-topbar shrink-0 items-center gap-2.5 border-b border-sa-border px-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-sa-blue">
          <GraduationCap className="h-4 w-4 text-sa-base" aria-hidden="true" />
        </span>
        <span className="text-body font-semibold text-sa-blue">EduCore Africa</span>
        <span className="rounded-full bg-sa-purple/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sa-purple">
          Super
        </span>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => allowed.has(item.section))
          if (items.length === 0) return null

          return (
            <div key={group.label} className="space-y-1">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-sa-dim">
                {group.label}
              </p>
              {items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={
                    item.href === "/console"
                      ? pathname === "/console"
                      : pathname.startsWith(item.href)
                  }
                />
              ))}
            </div>
          )
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-2.5 border-t border-sa-border p-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sa-surface text-[13px] font-semibold text-sa-text"
          aria-hidden="true"
        >
          {initials(user.name)}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-body font-medium">{user.name}</span>
          <span className="block truncate text-caption capitalize text-sa-dim">
            {user.role.replace(/_/g, " ").toLowerCase()}
          </span>
        </span>
        <form action={signOutAction}>
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-md text-sa-dim transition-colors hover:bg-sa-red/10 hover:text-sa-red"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      </div>
    </aside>
  )
}
