import { cn } from "@/lib/utils"

/** The shared section frame for every analytics tab. */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn("rounded-lg border border-sa-border bg-sa-surface", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-sa-border px-4 py-2.5">
        <div>
          <h2 className="text-h3">{title}</h2>
          {subtitle && <p className="text-caption text-sa-dim">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  )
}

/**
 * Says why a number is absent instead of printing a zero.
 *
 * A zero and "we cannot measure this" look identical on a dashboard and mean
 * opposite things, so anything the platform genuinely cannot observe renders
 * through here.
 */
export function Unmeasured({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-sa-border bg-sa-raised/40 px-3 py-2 text-caption text-sa-dim">
      {children}
    </p>
  )
}
