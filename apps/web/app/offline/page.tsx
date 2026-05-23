import Link from "next/link"
import { CloudOff, FileText, ClipboardCheck, CalendarRange, Megaphone } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export const metadata = { title: "Offline · EduCore Africa" }

const CACHED_LINKS = [
  {
    href: "/dashboard/students",
    title: "Students",
    description: "Browse cached student list.",
    icon: FileText,
  },
  {
    href: "/dashboard/attendance",
    title: "Mark attendance",
    description: "Marks save locally and sync when you're back online.",
    icon: ClipboardCheck,
  },
  {
    href: "/dashboard/timetable",
    title: "Timetable",
    description: "Last-known weekly schedule.",
    icon: CalendarRange,
  },
  {
    href: "/dashboard/announcements",
    title: "Announcements",
    description: "Cached notices.",
    icon: Megaphone,
  },
]

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="flex items-center gap-3 rounded-md border bg-amber-50 px-3 py-2">
        <CloudOff className="h-5 w-5 text-amber-700" />
        <div>
          <h1 className="text-sm font-semibold text-amber-900">You&apos;re offline</h1>
          <p className="text-xs text-amber-800">
            Some pages keep working from your last visit. New requests will retry automatically when you reconnect.
          </p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Here&apos;s what you can still open:</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {CACHED_LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href}>
              <Card className="transition hover:border-primary/40 hover:bg-primary/5">
                <CardContent className="flex items-start gap-3 p-4">
                  <l.icon className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{l.title}</p>
                    <p className="text-xs text-muted-foreground">{l.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
