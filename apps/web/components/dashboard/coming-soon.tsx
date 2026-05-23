import Link from "next/link"
import { Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

/**
 * Shared placeholder for sidebar entries whose feature isn't built yet.
 * Avoids 404s and makes the roadmap visible to users.
 */
export function ComingSoon({
  title,
  description,
  expected,
}: {
  title: string
  description: string
  expected?: string
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10">
            <Sparkles className="h-5 w-5 text-violet-600" />
          </div>
          <p className="text-base font-semibold">Coming soon</p>
          <p className="max-w-md text-sm text-muted-foreground">
            This area is on the roadmap and isn&apos;t built yet. The sidebar link is here so it
            shows up for the right roles when it ships.
          </p>
          {expected && (
            <Badge variant="outline" className="text-[10px]">
              Expected: {expected}
            </Badge>
          )}
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link href="/dashboard">← Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
