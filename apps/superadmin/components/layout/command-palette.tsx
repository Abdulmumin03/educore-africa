"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Building2, Loader2, User } from "lucide-react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { NAV_ITEMS } from "@/components/layout/nav"
import type { ConsoleSection } from "@/lib/permissions"

type SchoolHit = { id: string; name: string; slug: string; state: string | null; isActive: boolean }
type UserHit = { id: string; email: string; name: string; role: string; schoolName: string | null }

const MIN_QUERY = 2
const DEBOUNCE_MS = 180

/**
 * ⌘K palette. Pages are matched by cmdk's own fuzzy filter over the nav
 * config; schools and users come from /api/search, which needs the database.
 *
 * cmdk would also fuzzy-filter the fetched rows, which double-filters and
 * hides valid server hits — so `shouldFilter` is off and page matching is
 * done here instead.
 */
export function CommandPalette({
  open,
  onOpenChange,
  sections,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sections: ConsoleSection[]
}) {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [schools, setSchools] = React.useState<SchoolHit[]>([])
  const [users, setUsers] = React.useState<UserHit[]>([])
  const [loading, setLoading] = React.useState(false)

  const allowed = React.useMemo(() => new Set(sections), [sections])

  const pages = React.useMemo(() => {
    const visible = NAV_ITEMS.filter((item) => allowed.has(item.section))
    const needle = query.trim().toLowerCase()
    if (!needle) return visible
    return visible.filter(
      (item) =>
        item.label.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle),
    )
  }, [allowed, query])

  React.useEffect(() => {
    const needle = query.trim()
    if (needle.length < MIN_QUERY) {
      setSchools([])
      setUsers([])
      setLoading(false)
      return
    }

    setLoading(true)
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(needle)}`, {
          signal: controller.signal,
        })
        if (!response.ok) return
        const payload = (await response.json()) as { schools: SchoolHit[]; users: UserHit[] }
        setSchools(payload.schools)
        setUsers(payload.users)
      } catch {
        // Aborted or offline — leave the previous results in place.
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query])

  // Reset between openings so the last search isn't waiting there.
  React.useEffect(() => {
    if (!open) {
      setQuery("")
      setSchools([])
      setUsers([])
    }
  }, [open])

  function go(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search schools, users, or jump to a page…"
      />
      <CommandList>
        {!loading && pages.length === 0 && schools.length === 0 && users.length === 0 && (
          <CommandEmpty>
            {query.trim().length < MIN_QUERY
              ? "Type at least two characters to search."
              : "No results."}
          </CommandEmpty>
        )}

        {pages.length > 0 && (
          <CommandGroup heading="Pages">
            {pages.map((item) => (
              <CommandItem key={item.href} value={item.href} onSelect={() => go(item.href)}>
                <item.icon className="mr-2 h-4 w-4 text-sa-dim" aria-hidden="true" />
                <span>{item.label}</span>
                <CommandShortcut className="text-sa-dim">{item.description}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {schools.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Schools">
              {schools.map((school) => (
                <CommandItem
                  key={school.id}
                  value={school.id}
                  onSelect={() => go(`/console/schools/${school.id}`)}
                >
                  <Building2 className="mr-2 h-4 w-4 text-sa-dim" aria-hidden="true" />
                  <span className="truncate">{school.name}</span>
                  <CommandShortcut className="text-sa-dim">
                    {school.state ?? school.slug}
                    {school.isActive ? "" : " · inactive"}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {users.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Users">
              {users.map((user) => (
                <CommandItem
                  key={user.id}
                  value={user.id}
                  onSelect={() => go(`/console/users/${user.id}`)}
                >
                  <User className="mr-2 h-4 w-4 text-sa-dim" aria-hidden="true" />
                  <span className="truncate">{user.email}</span>
                  <CommandShortcut className="text-sa-dim">
                    {user.schoolName ?? user.role.replace(/_/g, " ").toLowerCase()}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-4 text-caption text-sa-dim">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Searching…
          </div>
        )}
      </CommandList>
    </CommandDialog>
  )
}
