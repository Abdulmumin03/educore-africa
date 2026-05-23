"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { UserRole } from "@prisma/client"
import { useQuery } from "@tanstack/react-query"
import { Compass, GraduationCap, Users } from "lucide-react"
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
import { filterNavForRole } from "@/components/dashboard/nav-config"

const RECENT_KEY = "educore.palette.recent"
const MAX_RECENT = 5

type Hit = {
  id: string
  label: string
  sub?: string
  href: string
  kind: "student" | "staff"
}

type SearchResponse = { students: Hit[]; staff: Hit[] }

async function searchPeople(q: string): Promise<SearchResponse> {
  if (!q.trim()) return { students: [], staff: [] }
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=5`)
  if (!res.ok) throw new Error("Search failed")
  return res.json()
}

function readRecent(): { href: string; label: string }[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as { href: string; label: string }[]) : []
  } catch {
    return []
  }
}

function writeRecent(entry: { href: string; label: string }) {
  if (typeof window === "undefined") return
  const current = readRecent().filter((e) => e.href !== entry.href)
  const next = [entry, ...current].slice(0, MAX_RECENT)
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
}

export function CommandPalette({
  open,
  onOpenChange,
  role,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  role: UserRole
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [recent, setRecent] = useState<{ href: string; label: string }[]>([])
  const navGroups = filterNavForRole(role)

  useEffect(() => {
    if (open) setRecent(readRecent())
    else setQuery("")
  }, [open])

  const { data } = useQuery({
    queryKey: ["palette-search", query],
    queryFn: () => searchPeople(query),
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
  })

  function go(href: string, label: string) {
    writeRecent({ href, label })
    onOpenChange(false)
    router.push(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search students, staff, or jump to a module…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        {data?.students.length ? (
          <>
            <CommandGroup heading="Students">
              {data.students.map((s) => (
                <CommandItem key={s.id} value={`student-${s.id}-${s.label}`} onSelect={() => go(s.href, s.label)}>
                  <Users className="mr-2 h-4 w-4" />
                  <div className="flex flex-col">
                    <span>{s.label}</span>
                    {s.sub && <span className="text-xs text-muted-foreground">{s.sub}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}

        {data?.staff.length ? (
          <>
            <CommandGroup heading="Staff">
              {data.staff.map((s) => (
                <CommandItem key={s.id} value={`staff-${s.id}-${s.label}`} onSelect={() => go(s.href, s.label)}>
                  <GraduationCap className="mr-2 h-4 w-4" />
                  <div className="flex flex-col">
                    <span>{s.label}</span>
                    {s.sub && <span className="text-xs text-muted-foreground">{s.sub}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}

        {query.trim().length < 2 && recent.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recent.map((r) => (
                <CommandItem key={r.href} value={`recent-${r.href}`} onSelect={() => go(r.href, r.label)}>
                  <Compass className="mr-2 h-4 w-4" />
                  {r.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {navGroups.map((group) => (
          <CommandGroup key={group.heading} heading={group.heading}>
            {group.items.map((item) => {
              const Icon = item.icon
              return (
                <CommandItem
                  key={item.href}
                  value={`nav-${item.href}-${item.label}`}
                  onSelect={() => go(item.href, item.label)}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {item.label}
                  <CommandShortcut>{group.heading.slice(0, 3)}</CommandShortcut>
                </CommandItem>
              )
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
