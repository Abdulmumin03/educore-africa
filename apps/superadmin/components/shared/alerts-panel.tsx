import Link from "next/link"

import type { Alert } from "@/lib/alerts"
import { cn } from "@/lib/utils"

const DOT: Record<Alert["severity"], string> = {
  critical: "bg-sa-red",
  warning: "bg-sa-amber",
  info: "bg-sa-blue",
}

export function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-body text-sa-dim">
        Nothing needs attention right now.
      </p>
    )
  }

  return (
    <ul>
      {alerts.map((alert) => (
        <li
          key={alert.id}
          className="flex items-start gap-2.5 border-b border-sa-border px-4 py-2.5 last:border-b-0"
        >
          <span
            className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", DOT[alert.severity])}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-body">{alert.message}</span>
            <span className="block text-caption text-sa-dim">{alert.detail}</span>
          </span>
          <Link
            href={alert.link}
            className="shrink-0 text-caption text-sa-blue transition-colors hover:text-sa-blue/80"
          >
            Open
          </Link>
        </li>
      ))}
    </ul>
  )
}
