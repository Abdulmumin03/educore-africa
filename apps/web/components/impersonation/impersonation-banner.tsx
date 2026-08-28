import { ShieldAlert } from "lucide-react"

/**
 * Always visible while a support session is active. Deliberately loud and
 * unmissable — anyone looking over a shoulder should be able to tell this is
 * not the school's own staff logged in.
 */
export function ImpersonationBanner({
  schoolName,
  expiresAt,
}: {
  schoolName: string
  expiresAt: Date
}) {
  const minutes = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60_000))

  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-1.5 text-center text-[13px] font-medium text-amber-950">
      <span className="inline-flex items-center gap-1.5">
        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        Viewing as EduCore Support — <strong>{schoolName}</strong>
      </span>
      <span className="opacity-80">
        Read-only. No changes can be saved. Expires in {minutes} minute{minutes === 1 ? "" : "s"}.
      </span>
      <a
        href="/api/impersonation/exit"
        className="rounded bg-amber-950/15 px-2 py-0.5 underline-offset-2 hover:bg-amber-950/25"
      >
        Exit
      </a>
    </div>
  )
}
