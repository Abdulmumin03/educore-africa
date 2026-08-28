import {
  Activity,
  Building2,
  DollarSign,
  Headphones,
  LayoutDashboard,
  Megaphone,
  Settings2,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { ConsoleSection } from "@/lib/permissions"

export type NavItem = {
  section: ConsoleSection
  label: string
  href: string
  icon: LucideIcon
  /** Shown in the command palette so a search hit explains itself. */
  description: string
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        section: "command-centre",
        label: "Command Centre",
        href: "/console",
        icon: LayoutDashboard,
        description: "Live platform health at a glance",
      },
    ],
  },
  {
    label: "Business",
    items: [
      {
        section: "schools",
        label: "Schools",
        href: "/console/schools",
        icon: Building2,
        description: "Every tenant on the platform",
      },
      {
        section: "revenue",
        label: "Revenue",
        href: "/console/revenue",
        icon: DollarSign,
        description: "MRR, invoices, collections",
      },
      {
        section: "users",
        label: "User Accounts",
        href: "/console/users",
        icon: Users,
        description: "Console staff and school accounts",
      },
      {
        section: "analytics",
        label: "Analytics",
        href: "/console/analytics",
        icon: TrendingUp,
        description: "Usage, adoption and cohorts",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        section: "support",
        label: "Support",
        href: "/console/support",
        icon: Headphones,
        description: "Tickets raised by schools",
      },
      {
        section: "growth",
        label: "Growth",
        href: "/console/growth",
        icon: Megaphone,
        description: "Pipeline, trials and churn",
      },
    ],
  },
  {
    label: "Platform",
    items: [
      {
        section: "system",
        label: "System Health",
        href: "/console/system",
        icon: Activity,
        description: "Jobs, queues and integrations",
      },
      {
        section: "config",
        label: "Configuration",
        href: "/console/config",
        icon: Settings2,
        description: "Plans, feature flags and defaults",
      },
      {
        section: "audit",
        label: "Audit Log",
        href: "/console/audit",
        icon: Shield,
        description: "Every action taken in this console",
      },
    ],
  },
]

/** Flat list — the command palette and the breadcrumb both want one. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)

/**
 * The nav entry a path belongs to. Longest href wins so
 * /console/schools/abc resolves to Schools rather than Command Centre.
 */
export function navItemForPath(pathname: string): NavItem | undefined {
  return NAV_ITEMS.filter((item) =>
    item.href === "/console" ? pathname === "/console" : pathname.startsWith(item.href),
  ).sort((a, b) => b.href.length - a.href.length)[0]
}
