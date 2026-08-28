import { prisma } from "@/lib/db"
import { cn } from "@/lib/utils"

const DATE: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }

const PRIORITY: Record<string, string> = {
  LOW: "bg-sa-dim/15 text-sa-dim",
  MEDIUM: "bg-sa-blue/15 text-sa-blue",
  HIGH: "bg-sa-amber/15 text-sa-amber",
  CRITICAL: "bg-sa-red/15 text-sa-red",
}

const STATUS: Record<string, string> = {
  OPEN: "bg-sa-amber/15 text-sa-amber",
  IN_PROGRESS: "bg-sa-blue/15 text-sa-blue",
  WAITING_ON_CLIENT: "bg-sa-purple/15 text-sa-purple",
  RESOLVED: "bg-sa-green/15 text-sa-green",
  CLOSED: "bg-sa-dim/15 text-sa-dim",
}

export async function SupportTab({ schoolId, schoolName }: { schoolId: string; schoolName: string }) {
  const tickets = await prisma.supportTicket.findMany({
    where: { schoolId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      title: true,
      category: true,
      priority: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      _count: { select: { comments: true } },
    },
  })

  const open = tickets.filter((ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS")

  return (
    <section className="overflow-hidden rounded-lg border border-sa-border bg-sa-surface">
      <header className="flex items-start justify-between gap-3 border-b border-sa-border px-4 py-2.5">
        <div>
          <h2 className="text-h3">Support tickets</h2>
          <p className="text-caption text-sa-dim">
            {open.length} open of {tickets.length} for {schoolName}
          </p>
        </div>
        <span className="inline-flex h-8 cursor-not-allowed items-center rounded-md border border-sa-border bg-sa-base px-3 text-body text-sa-disabled">
          Raise ticket — SA-06
        </span>
      </header>

      {tickets.length === 0 && (
        <p className="px-4 py-12 text-center text-body text-sa-dim">
          No tickets have been raised for this school.
        </p>
      )}

      {tickets.map((ticket) => (
        <div
          key={ticket.id}
          className="flex flex-wrap items-center gap-3 border-b border-sa-border px-4 py-2.5 last:border-b-0 hover:bg-sa-raised"
        >
          <span className={cn("shrink-0 rounded px-2 py-0.5 text-caption font-medium", PRIORITY[ticket.priority])}>
            {ticket.priority.toLowerCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-body">{ticket.title}</span>
          <span className="shrink-0 text-caption text-sa-dim">{ticket.category.replace(/_/g, " ").toLowerCase()}</span>
          <span className="tabular shrink-0 text-caption text-sa-dim">
            {ticket._count.comments} {ticket._count.comments === 1 ? "reply" : "replies"}
          </span>
          <span className={cn("shrink-0 rounded px-2 py-0.5 text-caption font-medium", STATUS[ticket.status])}>
            {ticket.status.replace(/_/g, " ").toLowerCase()}
          </span>
          <span className="tabular shrink-0 text-caption text-sa-dim">
            {ticket.createdAt.toLocaleDateString("en-GB", DATE)}
          </span>
        </div>
      ))}
    </section>
  )
}
