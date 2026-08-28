import type { Metadata } from "next"
import { ShieldAlert } from "lucide-react"

export const metadata: Metadata = { title: "Access denied" }

export default function DeniedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-sm space-y-3 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight">Access denied: IP not allowed</h1>
        <p className="text-sm text-muted-foreground">
          This network is not on the console allowlist. The attempt has been recorded. Connect
          through the office network or VPN and try again.
        </p>
      </div>
    </div>
  )
}
