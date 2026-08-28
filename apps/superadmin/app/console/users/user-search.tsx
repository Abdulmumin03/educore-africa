"use client"

import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { Search } from "lucide-react"

import { USER_ROLE_LABEL, USER_ROLE_ORDER } from "./roles"


/** Cross-school search bar. Every control writes to the URL so a result is shareable. */
export function UserSearch() {
  const router = useRouter()
  const params = useSearchParams()
  const [query, setQuery] = React.useState(params.get("q") ?? "")

  function push(next: URLSearchParams) {
    next.delete("page")
    router.push(`/console/users${next.toString() ? `?${next.toString()}` : ""}`)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const next = new URLSearchParams(params.toString())
    if (query.trim()) next.set("q", query.trim())
    else next.delete("q")
    push(next)
  }

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    push(next)
  }

  return (
    <form onSubmit={submit} className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[280px] flex-1">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sa-dim"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search every school by name, email or phone"
          aria-label="Search users across all schools"
          className="h-8 w-full rounded-md border border-sa-border bg-sa-raised pl-8 pr-2.5 text-body text-sa-text placeholder:text-sa-disabled focus:border-sa-blue focus:outline-none"
        />
      </div>

      <select
        value={params.get("role") ?? ""}
        onChange={(event) => set("role", event.target.value)}
        aria-label="Role"
        className="h-8 rounded-md border border-sa-border bg-sa-raised px-2 text-body text-sa-text focus:border-sa-blue focus:outline-none"
      >
        <option value="">Any role</option>
        {USER_ROLE_ORDER.map((role) => (
          <option key={role} value={role}>
            {USER_ROLE_LABEL[role]}
          </option>
        ))}
      </select>

      <select
        value={params.get("status") ?? ""}
        onChange={(event) => set("status", event.target.value)}
        aria-label="Account status"
        className="h-8 rounded-md border border-sa-border bg-sa-raised px-2 text-body text-sa-text focus:border-sa-blue focus:outline-none"
      >
        <option value="">Any status</option>
        <option value="active">Active</option>
        <option value="disabled">Disabled</option>
      </select>

      <button
        type="submit"
        className="h-8 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90"
      >
        Search
      </button>
    </form>
  )
}
