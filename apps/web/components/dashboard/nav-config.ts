import type { UserRole } from "@prisma/client"
import {
  BarChart3,
  Home,
  UserCircle,
  Users,
  GraduationCap,
  ClipboardCheck,
  FileBarChart,
  BookOpen,
  Banknote,
  CalendarClock,
  Building2,
  Library,
  Bus,
  MessageSquare,
  Megaphone,
  Send,
  Siren,
  Bot,
  Settings,
  ShieldCheck,
  ReceiptText,
  ListChecks,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  roles: UserRole[] | "*"
}

export type NavGroup = {
  heading: string
  items: NavItem[]
}

const ALL_ADMIN: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN"]

export const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Home, roles: "*" },
      {
        href: "/dashboard/my-profile",
        label: "My profile",
        icon: UserCircle,
        roles: [
          "STUDENT",
          "TEACHER",
          "PRINCIPAL",
          "BURSAR",
          "COUNSELOR",
          "LIBRARIAN",
          "HOSTEL_MASTER",
          "DRIVER",
        ],
      },
    ],
  },
  {
    heading: "Academics",
    items: [
      {
        href: "/dashboard/students",
        label: "Students",
        icon: Users,
        roles: [...ALL_ADMIN, "PRINCIPAL", "TEACHER", "PARENT"],
      },
      {
        href: "/dashboard/staff",
        label: "Staff",
        icon: GraduationCap,
        roles: [...ALL_ADMIN, "PRINCIPAL", "TEACHER", "BURSAR", "COUNSELOR"],
      },
      {
        href: "/dashboard/staff/leave",
        label: "Leave",
        icon: ClipboardCheck,
        roles: [
          ...ALL_ADMIN,
          "PRINCIPAL",
          "TEACHER",
          "BURSAR",
          "COUNSELOR",
          "LIBRARIAN",
          "HOSTEL_MASTER",
          "DRIVER",
        ],
      },
      {
        href: "/dashboard/staff/evaluations",
        label: "Evaluations",
        icon: FileBarChart,
        roles: [...ALL_ADMIN, "PRINCIPAL"],
      },
      {
        href: "/dashboard/staff/payroll",
        label: "Payroll",
        icon: Banknote,
        roles: [...ALL_ADMIN, "PRINCIPAL", "BURSAR"],
      },
      {
        href: "/dashboard/attendance",
        label: "Attendance",
        icon: ClipboardCheck,
        roles: [...ALL_ADMIN, "PRINCIPAL", "TEACHER"],
      },
      {
        href: "/dashboard/attendance/mark",
        label: "Mark attendance",
        icon: ClipboardCheck,
        roles: [...ALL_ADMIN, "PRINCIPAL", "TEACHER"],
      },
      {
        href: "/dashboard/attendance/reports",
        label: "Attendance reports",
        icon: FileBarChart,
        roles: [...ALL_ADMIN, "PRINCIPAL", "TEACHER", "COUNSELOR"],
      },
      {
        href: "/dashboard/attendance/ai-insights",
        label: "Attendance AI",
        icon: Bot,
        roles: [...ALL_ADMIN, "PRINCIPAL", "TEACHER", "COUNSELOR"],
      },
      {
        href: "/dashboard/grades",
        label: "Grades & Results",
        icon: FileBarChart,
        roles: [...ALL_ADMIN, "PRINCIPAL", "TEACHER"],
      },
      {
        href: "/dashboard/assignments",
        label: "Assignments",
        icon: BookOpen,
        roles: ["TEACHER", "STUDENT"],
      },
    ],
  },
  {
    heading: "Operations",
    items: [
      {
        href: "/dashboard/finance",
        label: "Finance",
        icon: Banknote,
        roles: [...ALL_ADMIN, "BURSAR", "PRINCIPAL"],
      },
      {
        href: "/dashboard/finance/invoices",
        label: "Invoices",
        icon: ReceiptText,
        roles: [...ALL_ADMIN, "BURSAR", "PRINCIPAL"],
      },
      {
        href: "/dashboard/finance/debtors",
        label: "Debtors",
        icon: ListChecks,
        roles: [...ALL_ADMIN, "BURSAR", "PRINCIPAL"],
      },
      {
        href: "/dashboard/finance/reports",
        label: "Finance reports",
        icon: TrendingUp,
        roles: [...ALL_ADMIN, "BURSAR", "PRINCIPAL"],
      },
      {
        href: "/dashboard/timetable",
        label: "Timetable",
        icon: CalendarClock,
        roles: [...ALL_ADMIN, "PRINCIPAL", "TEACHER"],
      },
      {
        href: "/dashboard/hostel",
        label: "Hostel",
        icon: Building2,
        roles: [...ALL_ADMIN, "HOSTEL_MASTER"],
      },
      {
        href: "/dashboard/library",
        label: "Library",
        icon: Library,
        roles: [...ALL_ADMIN, "LIBRARIAN"],
      },
      {
        href: "/dashboard/transport",
        label: "Transport",
        icon: Bus,
        roles: [...ALL_ADMIN, "DRIVER"],
      },
    ],
  },
  {
    heading: "Communication",
    items: [
      {
        href: "/dashboard/messages",
        label: "Messages",
        icon: MessageSquare,
        roles: "*",
      },
      {
        href: "/dashboard/announcements",
        label: "Announcements",
        icon: Megaphone,
        roles: [...ALL_ADMIN, "PRINCIPAL", "TEACHER"],
      },
      {
        href: "/dashboard/communications/sms",
        label: "Bulk SMS",
        icon: Send,
        roles: [...ALL_ADMIN, "PRINCIPAL", "BURSAR"],
      },
      {
        href: "/dashboard/communications/emergency",
        label: "Emergency alerts",
        icon: Siren,
        roles: [...ALL_ADMIN, "PRINCIPAL"],
      },
      {
        href: "/dashboard/communications/analytics",
        label: "Comms analytics",
        icon: BarChart3,
        roles: [...ALL_ADMIN, "PRINCIPAL"],
      },
    ],
  },
  {
    heading: "AI Intelligence",
    items: [
      {
        href: "/dashboard/ai",
        label: "AI Insights",
        icon: Bot,
        roles: [...ALL_ADMIN, "PRINCIPAL", "TEACHER"],
      },
    ],
  },
  {
    heading: "Settings",
    items: [
      {
        href: "/dashboard/settings",
        label: "School Settings",
        icon: Settings,
        roles: ALL_ADMIN,
      },
      {
        href: "/dashboard/settings/roles",
        label: "User Roles",
        icon: ShieldCheck,
        roles: ALL_ADMIN,
      },
    ],
  },
]

export function isItemVisible(item: NavItem, role: UserRole) {
  if (item.roles === "*") return true
  return item.roles.includes(role)
}

export function filterNavForRole(role: UserRole): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isItemVisible(item, role)),
  })).filter((group) => group.items.length > 0)
}
