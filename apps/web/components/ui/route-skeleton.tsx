import { Skeleton } from "@/components/ui/skeleton"

/**
 * Generic full-page skeleton used as the `loading.tsx` for any major route
 * that doesn't need a bespoke shimmer. Renders a header bar, a filter row,
 * and a list/grid of placeholder cards.
 */
export function RouteSkeleton({
  variant = "table",
}: {
  variant?: "table" | "grid" | "kpi"
}) {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {variant === "kpi" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : null}
      <Skeleton className="h-14" />
      {variant === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      )}
    </div>
  )
}
