import Link from "next/link"

import { prisma } from "@/lib/db"
import { CYCLE_LABEL, PLAN_LABEL } from "@/lib/plans"
import type { getSchoolDetail } from "@/lib/schools"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"
import { AddNoteForm } from "../add-note-form"

type School = NonNullable<Awaited<ReturnType<typeof getSchoolDetail>>>

const DATE: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-sa-border py-1.5 last:border-b-0">
      <span className="shrink-0 text-sa-muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

function Panel({ title, subtitle, action, children }: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-sa-border bg-sa-surface">
      <header className="flex items-start justify-between gap-3 border-b border-sa-border px-4 py-2.5">
        <div>
          <h2 className="text-h3">{title}</h2>
          {subtitle && <p className="text-caption text-sa-dim">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

const NOTE_TONE: Record<string, string> = {
  SALES: "bg-sa-green/15 text-sa-green",
  SUPPORT: "bg-sa-amber/15 text-sa-amber",
  CALL: "bg-sa-blue/15 text-sa-blue",
  ONBOARDING: "bg-sa-purple/15 text-sa-purple",
  GENERAL: "bg-sa-dim/15 text-sa-dim",
}

export async function OverviewTab({
  school,
  adoption,
  viewerId,
}: {
  school: School
  adoption: Array<{ module: string; label: string; rows: number; inUse: boolean }>
  viewerId: string
}) {
  const [notes, usage, principal] = await Promise.all([
    prisma.schoolCrmNote.findMany({
      where: { schoolId: school.id },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, authorId: true, category: true, body: true, createdAt: true },
    }),
    prisma.schoolUsageSnapshot.findMany({
      where: { schoolId: school.id },
      orderBy: { month: "desc" },
      take: 3,
      select: { logins: true, studentsAdded: true, feesProcessed: true },
    }),
    prisma.user.findFirst({
      where: { schoolId: school.id, deletedAt: null, role: "PRINCIPAL" },
      select: { firstName: true, lastName: true },
    }),
  ])

  const authors = await prisma.superAdminUser.findMany({
    where: { id: { in: [...new Set(notes.map((note) => note.authorId))] } },
    select: { id: true, name: true, role: true },
  })
  const authorById = new Map(authors.map((author) => [author.id, author]))

  const maxAdoption = Math.max(1, ...adoption.map((entry) => entry.rows))
  const logins = usage.reduce((sum, row) => sum + row.logins, 0)
  const added = usage.reduce((sum, row) => sum + row.studentsAdded, 0)
  const fees = usage.reduce((sum, row) => sum + Number(row.feesProcessed), 0)

  const renewsInDays = school.subscription?.renewsAt
    ? Math.ceil((school.subscription.renewsAt.getTime() - Date.now()) / 86_400_000)
    : null

  return (
    <div className="grid gap-4 xl:grid-cols-[3fr_2fr] xl:items-start">
      <div className="space-y-4">
        <Panel title="School information">
          <div className="px-4 pb-3 pt-1 text-body">
            <Row label="Address">{school.address ?? <span className="text-sa-disabled">Not recorded</span>}</Row>
            <Row label="Phone"><span className="tabular">{school.phone ?? "—"}</span></Row>
            <Row label="Email">{school.email ?? "—"}</Row>
            <Row label="Principal">
              {principal ? `${principal.firstName} ${principal.lastName}` : <span className="text-sa-disabled">No principal account</span>}
            </Row>
            <Row label="Accreditation"><span className="tabular">{school.accreditationNumber ?? "—"}</span></Row>
            <Row label="Ministry reg."><span className="tabular">{school.ministryRegNumber ?? "—"}</span></Row>
            <Row label="Curricula">
              {school.curricula.length > 0
                ? school.curricula.map((entry) => entry.name).join(" · ")
                : <span className="text-sa-disabled">None configured</span>}
            </Row>
            <Row label="Registered"><span className="tabular">{school.createdAt.toLocaleDateString("en-GB", DATE)}</span></Row>
          </div>
        </Panel>

        <Panel
          title="Feature adoption"
          subtitle="Rows of real data in each module — the breadth half of the health score"
          action={
            <span className="tabular shrink-0 text-caption text-sa-muted">
              {school.modulesInUse} of {school.totalModules} in use
            </span>
          }
        >
          <div className="space-y-2.5 px-4 py-4">
            {adoption.map((entry) => (
              <div key={entry.module} className="flex items-center gap-3">
                <span className={cn("w-28 shrink-0 text-body", !entry.inUse && "text-sa-dim")}>
                  {entry.label}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sa-base">
                  <span
                    className="block h-full rounded-full bg-sa-blue"
                    style={{ width: `${entry.inUse ? Math.max(4, (entry.rows / maxAdoption) * 100) : 0}%` }}
                  />
                </span>
                <span className={cn("tabular w-16 shrink-0 text-right text-caption", entry.inUse ? "text-sa-muted" : "text-sa-disabled")}>
                  {entry.inUse ? formatNumber(entry.rows) : "unused"}
                </span>
              </div>
            ))}
            {adoption.filter((entry) => !entry.inUse).length > 0 && (
              <p className="pt-1 text-caption text-sa-dim">
                {adoption.filter((entry) => !entry.inUse).map((entry) => entry.label).join(", ")}{" "}
                {adoption.filter((entry) => !entry.inUse).length === 1 ? "is" : "are"} unused. Worth a
                success call before renewal.
              </p>
            )}
          </div>
        </Panel>

        <Panel title="Usage trend" subtitle="Last 3 metered months">
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-3">
            {usage.length === 0 ? (
              <p className="text-body text-sa-dim sm:col-span-3">
                No usage has been metered for this school yet.
              </p>
            ) : (
              <>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">Logins</p>
                  <p className="tabular mt-1 text-[19px] font-semibold">{formatNumber(logins)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">Students added</p>
                  <p className="tabular mt-1 text-[19px] font-semibold">{formatNumber(added)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">Fees processed</p>
                  <p className="tabular mt-1 text-[19px] font-semibold">{formatCurrency(fees)}</p>
                </div>
              </>
            )}
          </div>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel
          title="Subscription"
          action={
            renewsInDays !== null ? (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-caption font-medium",
                  renewsInDays < 0
                    ? "bg-sa-red/15 text-sa-red"
                    : renewsInDays <= 30
                      ? "bg-sa-amber/15 text-sa-amber"
                      : "bg-sa-blue/15 text-sa-blue",
                )}
              >
                <span className="tabular">
                  {renewsInDays < 0 ? `${Math.abs(renewsInDays)} days overdue` : `${renewsInDays} days`}
                </span>
                {renewsInDays >= 0 && <span className="ml-1">to renewal</span>}
              </span>
            ) : undefined
          }
        >
          <div className="px-4 py-4">
            {school.subscription ? (
              <>
                <p className="text-h3">{PLAN_LABEL[school.subscription.plan]}</p>
                <div className="mt-3 text-body">
                  <Row label="Billing cycle">{CYCLE_LABEL[school.subscription.cycle]}</Row>
                  <Row label="Amount">
                    <span className="tabular">{formatCurrency(Number(school.subscription.amount))}</span>
                  </Row>
                  <Row label="Monthly equivalent">
                    <span className="tabular">{formatCurrency(school.mrr)}</span>
                  </Row>
                  <Row label="Next renewal">
                    <span className="tabular">
                      {school.subscription.renewsAt?.toLocaleDateString("en-GB", DATE) ?? "—"}
                    </span>
                  </Row>
                  <Row label="Payment method">{school.subscription.paymentMethod ?? "—"}</Row>
                  {school.subscription.promoCode && (
                    <Row label="Promo">
                      <span className="tabular">{school.subscription.promoCode}</span>
                      {school.subscription.promoPercent ? ` · ${school.subscription.promoPercent}% off` : ""}
                    </Row>
                  )}
                </div>
              </>
            ) : (
              <p className="text-body text-sa-dim">No subscription recorded.</p>
            )}
          </div>
        </Panel>

        <Panel title="CRM notes" subtitle="Internal only — never visible to the school">
          <div className="px-4">
            {notes.length === 0 && (
              <p className="py-6 text-center text-body text-sa-dim">No notes yet.</p>
            )}
            {notes.map((note) => {
              const author = authorById.get(note.authorId)
              return (
                <div key={note.id} className="flex gap-2.5 border-b border-sa-border py-2.5 last:border-b-0">
                  <span
                    className={cn(
                      "mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                      NOTE_TONE[note.category],
                    )}
                  >
                    {note.category}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body">{note.body}</p>
                    <p className="mt-0.5 text-caption text-sa-dim">
                      {author?.name ?? "Unknown"} ·{" "}
                      <span className="tabular">{note.createdAt.toLocaleDateString("en-GB", DATE)}</span>
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="px-4 py-3">
            <AddNoteForm schoolId={school.id} viewerId={viewerId} />
          </div>
        </Panel>

        <Panel title="Quick actions">
          <div className="flex flex-col gap-2 px-4 py-3">
            {[
              { label: "Extend trial", href: `/console/schools/${school.id}?tab=subscription` },
              { label: "Upgrade plan", href: `/console/schools/${school.id}?tab=subscription` },
              { label: "View users", href: `/console/schools/${school.id}?tab=users` },
              { label: "Open tickets", href: `/console/schools/${school.id}?tab=support` },
              { label: "Export all data", href: `/api/schools/export?search=${school.slug}` },
            ].map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="inline-flex h-8 items-center rounded-md border border-sa-border-em bg-sa-surface px-3 text-body transition-colors hover:bg-sa-raised"
              >
                {action.label}
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
