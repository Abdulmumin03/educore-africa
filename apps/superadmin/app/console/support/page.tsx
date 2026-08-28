import type { Metadata } from "next"
import { Suspense } from "react"
import type { TicketCategory, TicketPriority, TicketStatus } from "@prisma/client"

import { PageHeader } from "@/components/shared/page-header"
import { prisma } from "@/lib/db"
import { requireRole } from "@/lib/session"
import { listTickets } from "@/lib/support"
import { SupportNav } from "./support-nav"
import { TicketDetail } from "./ticket-detail"
import { TicketFiltersPanel } from "./ticket-filters"
import { TicketQueue } from "./ticket-queue"

export const metadata: Metadata = { title: "Support Console" }
export const dynamic = "force-dynamic"

const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_CLIENT", "RESOLVED", "CLOSED"]
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
const CATEGORIES = ["BILLING", "TECHNICAL", "FEATURE_REQUEST", "ACCOUNT", "OTHER"]

export default async function SupportPage({
  searchParams,
}: {
  searchParams: {
    status?: string
    priority?: string
    category?: string
    assignedTo?: string
    search?: string
    page?: string
    ticket?: string
  }
}) {
  const me = await requireRole("SUPPORT_ADMIN", "BUSINESS_ADMIN")

  // "me" is resolved here as well as in the API so the server-rendered first
  // paint already shows the right rows.
  const assignedTo =
    searchParams.assignedTo === "me" ? me.id : searchParams.assignedTo || undefined

  const [{ tickets, total, page, pages, statusCounts }, agents] = await Promise.all([
    listTickets({
      status:
        searchParams.status && STATUSES.includes(searchParams.status)
          ? (searchParams.status as TicketStatus)
          : "ALL",
      priority:
        searchParams.priority && PRIORITIES.includes(searchParams.priority)
          ? (searchParams.priority as TicketPriority)
          : undefined,
      category:
        searchParams.category && CATEGORIES.includes(searchParams.category)
          ? (searchParams.category as TicketCategory)
          : undefined,
      assignedTo,
      search: searchParams.search?.trim() || undefined,
      page: Number(searchParams.page ?? 1) || 1,
      limit: 30,
    }),
    prisma.superAdminUser.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  const openCount = (statusCounts.OPEN ?? 0) + (statusCounts.IN_PROGRESS ?? 0)
  const breached = tickets.filter((ticket) => ticket.sla.state === "breached").length

  return (
    <>
      <PageHeader
        title="Support Console"
        description={`${openCount} ticket${openCount === 1 ? "" : "s"} in flight${breached > 0 ? ` · ${breached} past SLA on this page` : ""}`}
      />

      <SupportNav />

      <div className="flex flex-col gap-4 lg:flex-row">
        <Suspense fallback={<div className="h-96 w-full shrink-0 lg:w-[320px]" />}>
          <TicketFiltersPanel agents={agents} statusCounts={statusCounts} />
        </Suspense>

        <div className="min-w-0 flex-1">
          <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-sa-surface" />}>
            <TicketQueue
              rows={tickets}
              total={total}
              page={page}
              pages={pages}
              openTicketId={searchParams.ticket ?? null}
            />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={null}>
        <TicketDetail ticketId={searchParams.ticket ?? null} />
      </Suspense>
    </>
  )
}
