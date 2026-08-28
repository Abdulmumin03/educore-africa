import { Inbox } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-sa-border bg-sa-surface py-16 text-center">
      <Icon className="h-6 w-6 text-sa-disabled" aria-hidden="true" />
      <p className="text-body font-medium text-sa-muted">{title}</p>
      {description && <p className="max-w-md text-caption text-sa-dim">{description}</p>}
      {action}
    </div>
  )
}
