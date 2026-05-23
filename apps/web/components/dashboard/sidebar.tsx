"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { UserRole } from "@prisma/client"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { filterNavForRole } from "@/components/dashboard/nav-config"

type Props = {
  role: UserRole
  collapsed: boolean
  onToggle: () => void
  variant?: "desktop" | "mobile"
  onNavigate?: () => void
}

export function Sidebar({ role, collapsed, onToggle, variant = "desktop", onNavigate }: Props) {
  const pathname = usePathname()
  const groups = filterNavForRole(role)

  return (
    <aside
      className={cn(
        "flex h-full flex-col text-slate-200 transition-[width] duration-300 ease-out",
        "bg-[#0D2B5E]",
        variant === "desktop" && (collapsed ? "w-16" : "w-60"),
        variant === "mobile" && "w-full",
      )}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-white/10",
          collapsed && variant === "desktop" ? "justify-center px-0" : "justify-between px-4",
        )}
      >
        {!collapsed || variant === "mobile" ? (
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-base font-semibold text-white"
            onClick={onNavigate}
          >
            <span className="grid h-7 w-7 place-items-center rounded-md bg-white text-[#0D2B5E] text-xs font-bold">
              EC
            </span>
            <span>EduCore</span>
          </Link>
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-md bg-white text-[#0D2B5E] text-xs font-bold">
            EC
          </span>
        )}
        {variant === "desktop" && (
          <button
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "rounded-md p-1 text-slate-300 hover:bg-white/10 hover:text-white",
              collapsed && "hidden",
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4">
        {groups.map((group) => (
          <div key={group.heading} className="mb-4">
            {(!collapsed || variant === "mobile") && (
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {group.heading}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"))
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed && variant === "desktop" ? item.label : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-md text-sm font-medium",
                        "px-2 py-2 text-slate-300 hover:bg-white/5 hover:text-white",
                        active && "bg-white/10 text-white border-l-2 border-sky-400 pl-[6px]",
                        collapsed && variant === "desktop" && "justify-center px-0",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {(!collapsed || variant === "mobile") && <span>{item.label}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {variant === "desktop" && collapsed && (
        <button
          onClick={onToggle}
          aria-label="Expand sidebar"
          className="mx-auto mb-3 rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4 rotate-180" />
        </button>
      )}
    </aside>
  )
}
