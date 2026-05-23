"use client"

import { useEffect, useState } from "react"
import type { UserRole } from "@prisma/client"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Topbar } from "@/components/dashboard/topbar"
import { CommandPalette } from "@/components/dashboard/command-palette"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

type Props = {
  user: {
    name?: string | null
    email: string
    image?: string | null
    role: UserRole
  }
  school: { name: string; logoUrl: string | null } | null
  children: React.ReactNode
}

const COLLAPSE_KEY = "educore.sidebar.collapsed"

export function DashboardShell({ user, school, children }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Persist sidebar collapse state across reloads.
  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSE_KEY)
    if (stored === "1") setCollapsed(true)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0")
  }, [collapsed])

  // Global Cmd/Ctrl-K shortcut.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="flex h-screen w-full overflow-hidden bg-muted/30">
      <div className="hidden lg:block">
        <Sidebar
          role={user.role}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 lg:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <Sidebar
            role={user.role}
            collapsed={false}
            onToggle={() => setMobileOpen(false)}
            variant="mobile"
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          user={user}
          school={school}
          onMobileMenu={() => setMobileOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} role={user.role} />
    </div>
  )
}
