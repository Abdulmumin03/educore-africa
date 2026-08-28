"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, CircleHelp, LogOut, Search, ShieldCheck, User } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CommandPalette } from "@/components/layout/command-palette"
import { NotificationBell } from "@/components/layout/notification-bell"
import { navItemForPath } from "@/components/layout/nav"
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

// Segments whose correct casing title-casing would get wrong.
const SEGMENT_LABELS: Record<string, string> = {
  sla: "SLA",
  nps: "NPS",
  api: "API",
  totp: "TOTP",
  mfa: "MFA",
  crm: "CRM",
}

function titleCase(segment: string) {
  return segment
    .split("-")
    .map((word) => SEGMENT_LABELS[word] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

type Crumb = { label: string; href: string }

/**
 * Breadcrumb from the URL. The nav config names the section so the label
 * matches the sidebar exactly; anything deeper is title-cased from the path.
 * A 25-character id segment is rendered as a short ref rather than in full.
 */
function useBreadcrumbs(pathname: string): Crumb[] {
  return React.useMemo(() => {
    const crumbs: Crumb[] = [{ label: "Console", href: "/console" }]
    const nav = navItemForPath(pathname)

    if (nav && nav.href !== "/console") {
      crumbs.push({ label: nav.label, href: nav.href })
    }

    const rest = pathname
      .slice((nav?.href ?? "/console").length)
      .split("/")
      .filter(Boolean)

    let href = nav?.href ?? "/console"
    for (const segment of rest) {
      href += `/${segment}`
      const looksLikeId = /^[a-z0-9]{20,}$/i.test(segment)
      crumbs.push({ label: looksLikeId ? `#${segment.slice(0, 8)}` : titleCase(segment), href })
    }

    return crumbs
  }, [pathname])
}

export function Topbar({
  user,
  sections,
}: {
  user: ConsoleUser
  sections: ConsoleSection[]
}) {
  const pathname = usePathname()
  const crumbs = useBreadcrumbs(pathname)
  const [paletteOpen, setPaletteOpen] = React.useState(false)

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setPaletteOpen((previous) => !previous)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <>
      <header className="fixed inset-x-0 left-sidebar top-0 z-40 flex h-topbar items-center gap-4 border-b border-sa-border bg-sa-surface px-6">
        <nav aria-label="Breadcrumb" className="flex min-w-0 shrink items-center gap-1.5">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1
            return (
              <React.Fragment key={crumb.href}>
                {index > 0 && (
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 text-sa-disabled"
                    aria-hidden="true"
                  />
                )}
                {last ? (
                  <span aria-current="page" className="truncate font-medium">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="truncate text-sa-dim transition-colors hover:text-sa-text"
                  >
                    {crumb.label}
                  </Link>
                )}
              </React.Fragment>
            )
          })}
        </nav>

        <div className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 w-full max-w-[420px] items-center gap-2 rounded-md border border-sa-border-em/60 bg-sa-base px-2.5 text-left text-sa-dim transition-colors hover:border-sa-border-em hover:text-sa-muted"
          >
            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate text-body">Search schools, users…</span>
            <kbd className="rounded border border-sa-border-em bg-sa-raised px-1.5 py-0.5 font-mono text-[11px] leading-none text-sa-muted">
              ⌘K
            </kbd>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <NotificationBell />

          <Link
            href="/console/docs"
            aria-label="Help and documentation"
            className="flex h-8 w-8 items-center justify-center rounded-md text-sa-muted transition-colors hover:bg-sa-raised hover:text-sa-text"
          >
            <CircleHelp className="h-[17px] w-[17px]" aria-hidden="true" />
          </Link>

          <span className="mx-1.5 h-5 w-px bg-sa-border-em" aria-hidden="true" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-md pl-1 pr-1.5 transition-colors hover:bg-sa-raised"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sa-purple/15 font-mono text-[11px] font-semibold text-sa-purple">
                  {initials(user.name)}
                </span>
                <ChevronRight className="h-3 w-3 rotate-90 text-sa-muted" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="space-y-0.5">
                <span className="block truncate text-body font-medium">{user.email}</span>
                <span className="block text-caption font-normal capitalize text-sa-dim">
                  {user.role.replace(/_/g, " ").toLowerCase()}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/console/settings/profile" className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" aria-hidden="true" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/console/settings/security/totp" className="cursor-pointer">
                  <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                  Security
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <form action={signOutAction}>
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                    Sign out
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} sections={sections} />
    </>
  )
}
