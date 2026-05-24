import type { ReactNode } from "react"

export function AuthCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="animate-fade-up relative overflow-hidden rounded-2xl border border-navy/10 bg-white p-7 shadow-xl shadow-navy/[0.04] sm:p-9">
      <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-amber-100/50 blur-3xl" />
      <div className="relative">
        {eyebrow && (
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
            {eyebrow}
          </span>
        )}
        <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-navy md:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-sm leading-relaxed text-navy/65">{description}</p>
        )}
        <div className="mt-7">{children}</div>
      </div>
    </div>
  )
}
