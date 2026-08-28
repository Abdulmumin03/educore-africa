import { prisma } from "@/lib/db"
import { auditTarget } from "@/lib/audit"
import { cn } from "@/lib/utils"

const DATETIME: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}

function tone(action: string): string {
  if (action.startsWith("IMPERSONATION")) return "bg-sa-purple/15 text-sa-purple"
  if (action.includes("suspend") || action.includes("churn")) return "bg-sa-red/15 text-sa-red"
  if (action.includes("subscription") || action.includes("status")) return "bg-sa-amber/15 text-sa-amber"
  if (action.includes("export")) return "bg-sa-dim/15 text-sa-dim"
  return "bg-sa-blue/15 text-sa-blue"
}

export async function ActivityTab({ schoolId }: { schoolId: string }) {
  const entries = await prisma.superAdminAuditLog.findMany({
    where: { targetType: "school", target: auditTarget("school", schoolId) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      action: true,
      details: true,
      ipAddress: true,
      createdAt: true,
      user: { select: { name: true, role: true } },
    },
  })

  return (
    <section className="overflow-hidden rounded-lg border border-sa-border bg-sa-surface">
      <header className="border-b border-sa-border px-4 py-2.5">
        <h2 className="text-h3">Activity log</h2>
        <p className="text-caption text-sa-dim">
          Everything EduCore staff have done to this school. Written by lib/audit, never editable.
        </p>
      </header>

      {entries.length === 0 && (
        <p className="px-4 py-12 text-center text-body text-sa-dim">
          No console actions recorded against this school yet.
        </p>
      )}

      {entries.map((entry) => (
        <div key={entry.id} className="flex items-start gap-3 border-b border-sa-border px-4 py-2.5 last:border-b-0">
          <span className={cn("mt-0.5 shrink-0 rounded px-2 py-0.5 font-mono text-[10px] font-semibold", tone(entry.action))}>
            {entry.action}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body">
              {entry.user?.name ?? "Unknown actor"}
              {entry.user?.role && (
                <span className="text-sa-dim"> · {entry.user.role.replace(/_/g, " ").toLowerCase()}</span>
              )}
            </p>
            {entry.details !== null && entry.details !== undefined && (
              <p className="mt-0.5 truncate font-mono text-caption text-sa-dim">
                {JSON.stringify(entry.details)}
              </p>
            )}
          </div>
          <span className="tabular shrink-0 text-caption text-sa-dim">
            {entry.createdAt.toLocaleString("en-GB", DATETIME)}
          </span>
          <span className="tabular shrink-0 text-caption text-sa-disabled">{entry.ipAddress}</span>
        </div>
      ))}
    </section>
  )
}
