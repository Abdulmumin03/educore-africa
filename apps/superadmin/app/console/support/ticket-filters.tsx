"use client"

import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"

import { cn } from "@/lib/utils"

const STATUSES = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_ON_CLIENT", label: "Waiting on client" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
]

const PRIORITIES = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
]

const CATEGORIES = [
  { value: "BILLING", label: "Billing" },
  { value: "TECHNICAL", label: "Technical" },
  { value: "FEATURE_REQUEST", label: "Feature request" },
  { value: "ACCOUNT", label: "Account" },
  { value: "OTHER", label: "Other" },
]

export function TicketFiltersPanel({
  agents,
  statusCounts,
}: {
  agents: Array<{ id: string; name: string }>
  statusCounts: Record<string, number>
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [search, setSearch] = React.useState(params.get("search") ?? "")

  const status = params.get("status") ?? "ALL"
  const priority = params.get("priority")
  const category = params.get("category")
  const assignedTo = params.get("assignedTo")

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString())
    if (value === null || value === "") next.delete(key)
    else next.set(key, value)
    // Any filter change invalidates the page cursor and the open ticket.
    next.delete("page")
    next.delete("ticket")
    router.push(`/console/support?${next.toString()}`)
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault()
    set("search", search.trim() || null)
  }

  const activeFilters = [priority, category, assignedTo, params.get("search")].filter(Boolean).length

  return (
    <aside className="w-full shrink-0 space-y-4 lg:w-[320px]" aria-label="Ticket filters">
      <form onSubmit={submitSearch}>
        <label htmlFor="ticket-search" className="mb-1 block text-caption uppercase tracking-wide text-sa-dim">
          Search
        </label>
        <input
          id="ticket-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Title, description or school"
          className="h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body text-sa-text placeholder:text-sa-disabled focus:border-sa-blue focus:outline-none"
        />
      </form>

      <fieldset>
        <legend className="mb-1.5 text-caption uppercase tracking-wide text-sa-dim">Status</legend>
        <div className="space-y-0.5">
          {STATUSES.map((option) => {
            const active = status === option.value
            const count = option.value === "ALL" ? null : (statusCounts[option.value] ?? 0)
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => set("status", option.value === "ALL" ? null : option.value)}
                className={cn(
                  "flex h-8 w-full items-center justify-between rounded-md px-2.5 text-body transition-colors",
                  active ? "bg-sa-raised text-sa-text" : "text-sa-muted hover:bg-sa-raised/60 hover:text-sa-text",
                )}
              >
                {option.label}
                {count !== null && (
                  <span className="font-mono text-caption tabular-nums text-sa-dim">{count}</span>
                )}
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-caption uppercase tracking-wide text-sa-dim">Priority</legend>
        <div className="flex flex-wrap gap-1.5">
          {PRIORITIES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={priority === option.value}
              onClick={() => set("priority", priority === option.value ? null : option.value)}
              className={cn(
                "h-7 rounded-full border px-2.5 text-caption transition-colors",
                priority === option.value
                  ? "border-sa-blue bg-sa-blue/15 text-sa-text"
                  : "border-sa-border text-sa-muted hover:text-sa-text",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-caption uppercase tracking-wide text-sa-dim">Category</legend>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={category === option.value}
              onClick={() => set("category", category === option.value ? null : option.value)}
              className={cn(
                "h-7 rounded-full border px-2.5 text-caption transition-colors",
                category === option.value
                  ? "border-sa-blue bg-sa-blue/15 text-sa-text"
                  : "border-sa-border text-sa-muted hover:text-sa-text",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-caption uppercase tracking-wide text-sa-dim">Assignee</legend>
        <select
          value={assignedTo ?? ""}
          onChange={(event) => set("assignedTo", event.target.value || null)}
          className="h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2 text-body text-sa-text focus:border-sa-blue focus:outline-none"
        >
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="UNASSIGNED">Unassigned</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </fieldset>

      {activeFilters > 0 && (
        <button
          type="button"
          onClick={() => router.push("/console/support")}
          className="text-caption text-sa-blue hover:underline"
        >
          Clear {activeFilters} filter{activeFilters === 1 ? "" : "s"}
        </button>
      )}
    </aside>
  )
}
