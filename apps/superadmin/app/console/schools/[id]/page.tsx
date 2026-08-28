import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { PlanBadge } from "@/components/shared/plan-badge"
import { StatusBadge } from "@/components/shared/status-badge"
import { logDataAccess, type AccessScope } from "@/lib/data-access"
import { prisma } from "@/lib/db"
import { HEALTH_TONE, healthBand } from "@/lib/health"
import { CYCLE_LABEL, PLAN_LABEL } from "@/lib/plans"
import { featureAdoption, getSchoolDetail } from "@/lib/schools"
import { headers } from "next/headers"

import { clientIp } from "@/lib/ip"
import { requireConsoleUser } from "@/lib/session"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"
import { ImpersonateButton } from "./impersonate-button"
import { SchoolActions } from "./school-actions"
import { ActivityTab } from "./tabs/activity-tab"
import { FinancialsTab } from "./tabs/financials-tab"
import { OverviewTab } from "./tabs/overview-tab"
import { SubscriptionTab } from "./tabs/subscription-tab"
import { SupportTab } from "./tabs/support-tab"
import { UsageTab } from "./tabs/usage-tab"
import { UsersTab } from "./tabs/users-tab"

export const dynamic = "force-dynamic"

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "subscription", label: "Subscription" },
  { key: "usage", label: "Usage" },
  { key: "financials", label: "Financials" },
  { key: "users", label: "Users" },
  { key: "support", label: "Support" },
  { key: "activity", label: "Activity Log" },
] as const

type TabKey = (typeof TABS)[number]["key"]

export async function generateMetadata({
  params,
}: {
  params: { id: string }
}): Promise<Metadata> {
  const school = await prisma.school.findUnique({
    where: { id: params.id },
    select: { name: true },
  })
  return { title: school?.name ?? "School" }
}

function Gauge({ score }: { score: number }) {
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const band = healthBand(score)
  const stroke =
    band === "critical" ? "#EF4444" : band === "at-risk" ? "#F59E0B" : "#22C55E"

  return (
    <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`Health score ${score} of 100`}>
      <circle cx="32" cy="32" r={radius} fill="none" stroke="#16233A" strokeWidth="7" />
      <circle
        cx="32"
        cy="32"
        r={radius}
        fill="none"
        stroke={stroke}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
        transform="rotate(-90 32 32)"
      />
      <text
        x="32"
        y="37"
        textAnchor="middle"
        fill="#F8FAFC"
        fontFamily="var(--font-mono), monospace"
        fontSize="18"
        fontWeight="700"
      >
        {score}
      </text>
    </svg>
  )
}

function Metric({
  label,
  value,
  hint,
  children,
}: {
  label: string
  value?: string
  hint?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-sa-border bg-sa-surface p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">{label}</p>
      {value && <p className="tabular mt-1.5 text-[26px] font-bold leading-none">{value}</p>}
      {children}
      {hint && <div className="mt-1.5 text-caption text-sa-dim">{hint}</div>}
    </div>
  )
}

export default async function SchoolProfilePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { tab?: string }
}) {
  const user = await requireConsoleUser()
  const school = await getSchoolDetail(params.id)
  if (!school) notFound()

  const adoption = await featureAdoption(school.id)
  const tab = (TABS.find((entry) => entry.key === searchParams.tab)?.key ?? "overview") as TabKey

  // NDPR: a school is entitled to know that EduCore staff READ its data, not
  // only that they changed it. Recorded per tab, because "looked at the
  // overview" and "read the student roll" are different disclosures. Awaited
  // rather than fired and forgotten — a read that goes unrecorded is exactly
  // the failure this record exists to prevent.
  const ACCESS_SCOPE: Record<TabKey, AccessScope> = {
    overview: "school.overview",
    subscription: "school.overview",
    usage: "school.usage",
    financials: "school.financials",
    users: "school.users",
    support: "school.support",
    activity: "school.activity",
  }
  await logDataAccess({
    staffId: user.id,
    schoolId: school.id,
    scope: ACCESS_SCOPE[tab],
    path: `/console/schools/${school.id}?tab=${tab}`,
    ipAddress: clientIp(headers()),
  })

  const band = healthBand(school.health)
  const initials = school.name
    .split(" ")
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  const openTickets = await prisma.supportTicket.count({
    where: { schoolId: school.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
  })

  return (
    <>
      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-full border border-sa-border-em bg-[#14304F] text-[17px] font-bold text-sa-blue">
            {initials}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[20px] font-bold tracking-tight">{school.name}</h1>
              {school.subscription ? (
                <>
                  <StatusBadge status={school.subscription.status} />
                  <PlanBadge plan={school.subscription.plan} />
                </>
              ) : (
                <span className="rounded bg-sa-dim/15 px-2 py-0.5 text-caption text-sa-dim">
                  No subscription
                </span>
              )}
            </div>
            <p className="mt-0.5 text-body text-sa-muted">
              {[school.city, school.state, school.country].filter(Boolean).join(", ")} ·{" "}
              <span className="tabular">{school.slug}</span> · on EduCore since{" "}
              <span className="tabular">
                {school.createdAt.toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ImpersonateButton schoolId={school.id} schoolName={school.name} />
          <Link
            href={`/console/schools/${school.id}?tab=subscription`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sa-border-em bg-sa-surface px-3 text-body font-medium transition-colors hover:bg-sa-raised"
          >
            Edit subscription
          </Link>
          <SchoolActions
            schoolId={school.id}
            schoolName={school.name}
            status={school.subscription?.status ?? null}
          />
        </div>
      </div>

      {/* METRICS */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Enrolled students"
          value={formatNumber(school._count.students)}
          hint={`${formatNumber(school._count.users)} user accounts`}
        />
        <Metric label="Active staff" value={formatNumber(school._count.staff)} />
        <Metric
          label="MRR"
          value={school.mrr > 0 ? formatCurrency(school.mrr) : "—"}
          hint={
            school.subscription
              ? `${formatCurrency(Number(school.subscription.amount))} ${CYCLE_LABEL[
                  school.subscription.cycle
                ].toLowerCase()}`
              : "No subscription recorded"
          }
        />
        <Metric
          label="Fee collection"
          value={school.collectionRate === null ? "—" : `${(school.collectionRate * 100).toFixed(1)}%`}
        >
          {school.collectionRate !== null && (
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-sa-base">
              <span
                className="block h-full rounded-full bg-sa-green"
                style={{ width: `${school.collectionRate * 100}%` }}
              />
            </span>
          )}
        </Metric>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-sa-border bg-sa-surface p-3.5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">
              Health score
            </p>
            <p className={cn("mt-1.5 text-body font-medium capitalize", HEALTH_TONE[band])}>
              {band.replace("-", " ")}
            </p>
            <p className="mt-0.5 text-caption text-sa-dim">
              {school.modulesInUse}/{school.totalModules} modules in use
            </p>
          </div>
          <Gauge score={school.health} />
        </div>
      </div>

      {/* TABS */}
      <nav className="mt-4 flex items-center gap-1 border-b border-sa-border" aria-label="School sections">
        {TABS.map((entry) => (
          <Link
            key={entry.key}
            href={`/console/schools/${school.id}?tab=${entry.key}`}
            aria-current={tab === entry.key ? "page" : undefined}
            className={cn(
              "inline-flex h-[34px] items-center gap-1.5 border-b-2 px-3 text-body transition-colors",
              tab === entry.key
                ? "border-sa-blue font-medium text-sa-text"
                : "border-transparent text-sa-muted hover:text-sa-text",
            )}
          >
            {entry.label}
            {entry.key === "support" && openTickets > 0 && (
              <span className="tabular rounded bg-sa-amber/15 px-1.5 text-[10px] font-semibold text-sa-amber">
                {openTickets}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="mt-4">
        {tab === "overview" && (
          <OverviewTab school={school} adoption={adoption} viewerId={user.id} />
        )}
        {tab === "subscription" && <SubscriptionTab school={school} />}
        {tab === "usage" && <UsageTab schoolId={school.id} plan={school.subscription?.plan ?? null} />}
        {tab === "financials" && <FinancialsTab schoolId={school.id} />}
        {tab === "users" && <UsersTab schoolId={school.id} />}
        {tab === "support" && <SupportTab schoolId={school.id} schoolName={school.name} />}
        {tab === "activity" && <ActivityTab schoolId={school.id} />}
      </div>

      {school.subscription === null && (
        <p className="mt-4 rounded-lg border border-sa-amber/30 bg-sa-amber/5 px-4 py-3 text-body text-sa-amber">
          This school has no subscription record, so plan, MRR and renewal are blank. Create one from
          the Subscription tab. Plan {PLAN_LABEL.STARTER} with a 30-day trial is the usual default.
        </p>
      )}
    </>
  )
}
