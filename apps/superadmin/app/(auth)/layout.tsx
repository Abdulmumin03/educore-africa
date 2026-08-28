import { ShieldCheck } from "lucide-react"

// The auth screens are always dark, regardless of the viewer's theme — a
// deliberate visual break from the school app so nobody mistakes one login
// form for the other.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">EduCore Africa</h1>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Super Admin Console
          </p>
        </div>

        {children}

        <p className="text-center text-xs text-muted-foreground">
          Internal system. Every action is recorded against your account.
        </p>
      </div>
    </div>
  )
}
