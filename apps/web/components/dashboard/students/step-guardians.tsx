"use client"

import { useState } from "react"
import { Plus, Search, UserPlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import type { GuardianInput } from "@/lib/student-schemas"
import { guardiansStepSchema } from "@/lib/student-schemas"

type ParentHit = {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
  relationship: string | null
  occupation: string | null
  address: string | null
  childCount: number
}

function emptyGuardian(isPrimary = false): GuardianInput {
  return {
    firstName: "",
    lastName: "",
    relationship: isPrimary ? "Father" : "",
    phone: "",
    email: "",
    occupation: "",
    address: "",
    isPrimary,
    isEmergencyContact: isPrimary,
    canPickup: true,
  }
}

export function StepGuardians({
  defaults,
  onBack,
  onSubmit,
}: {
  defaults?: GuardianInput[]
  onBack: () => void
  onSubmit: (v: GuardianInput[]) => void
}) {
  const [guardians, setGuardians] = useState<GuardianInput[]>(
    defaults && defaults.length > 0 ? defaults : [emptyGuardian(true)],
  )
  const [errors, setErrors] = useState<string | null>(null)

  function update(idx: number, patch: Partial<GuardianInput>) {
    setGuardians((arr) => arr.map((g, i) => (i === idx ? { ...g, ...patch } : g)))
  }

  function add() {
    if (guardians.length >= 3) return
    setGuardians((arr) => [...arr, emptyGuardian()])
  }

  function remove(idx: number) {
    if (guardians.length === 1) return
    setGuardians((arr) => arr.filter((_, i) => i !== idx))
  }

  function setAsPrimary(idx: number) {
    setGuardians((arr) => arr.map((g, i) => ({ ...g, isPrimary: i === idx })))
  }

  function linkExisting(idx: number, hit: ParentHit) {
    update(idx, {
      parentId: hit.id,
      firstName: hit.firstName,
      lastName: hit.lastName,
      phone: hit.phone ?? "",
      email: hit.email ?? "",
      occupation: hit.occupation ?? "",
      address: hit.address ?? "",
      relationship: hit.relationship ?? guardians[idx]?.relationship ?? "",
    })
    toast.success("Linked to existing parent")
  }

  function next() {
    const parsed = guardiansStepSchema.safeParse(guardians)
    if (!parsed.success) {
      setErrors(parsed.error.issues[0]?.message ?? "Fix the highlighted fields")
      return
    }
    if (!parsed.data.some((g) => g.isPrimary)) {
      setErrors("Mark one guardian as primary")
      return
    }
    setErrors(null)
    onSubmit(parsed.data)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Guardians</h2>
        <p className="text-sm text-muted-foreground">
          Up to 3 guardians. The primary guardian receives SMS notifications.
        </p>
      </div>

      <div className="space-y-4">
        {guardians.map((g, idx) => (
          <GuardianCard
            key={idx}
            index={idx}
            value={g}
            canRemove={guardians.length > 1}
            onChange={(patch) => update(idx, patch)}
            onRemove={() => remove(idx)}
            onSetPrimary={() => setAsPrimary(idx)}
            onLinkExisting={(hit) => linkExisting(idx, hit)}
          />
        ))}
      </div>

      {guardians.length < 3 && (
        <Button type="button" variant="outline" onClick={add}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add another guardian
        </Button>
      )}

      {errors && <p className="text-sm text-destructive">{errors}</p>}

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>← Back</Button>
        <Button type="button" onClick={next}>Continue</Button>
      </div>
    </div>
  )
}

function GuardianCard({
  index,
  value,
  canRemove,
  onChange,
  onRemove,
  onSetPrimary,
  onLinkExisting,
}: {
  index: number
  value: GuardianInput
  canRemove: boolean
  onChange: (patch: Partial<GuardianInput>) => void
  onRemove: () => void
  onSetPrimary: () => void
  onLinkExisting: (p: ParentHit) => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ParentHit[]>([])
  const [searching, setSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  async function search() {
    if (query.trim().length < 2) return
    setSearching(true)
    try {
      const res = await fetch(`/api/parents/search?q=${encodeURIComponent(query.trim())}`)
      const data = (await res.json()) as { items: ParentHit[] }
      setResults(data.items ?? [])
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Guardian {index + 1}</span>
          {value.isPrimary ? <Badge>Primary</Badge> : null}
          {value.parentId ? <Badge variant="secondary">Linked</Badge> : null}
        </div>
        <div className="flex items-center gap-1">
          {!value.isPrimary && (
            <Button type="button" variant="ghost" size="sm" onClick={onSetPrimary}>
              Make primary
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowSearch((v) => !v)}
          >
            <UserPlus className="mr-1 h-4 w-4" />
            Link existing
          </Button>
          {canRemove && (
            <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {showSearch && (
        <div className="mt-3 rounded-md border bg-muted/40 p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or phone"
                className="pl-8"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())}
              />
            </div>
            <Button type="button" size="sm" onClick={search} disabled={searching}>
              Search
            </Button>
          </div>
          {results.length > 0 && (
            <ul className="mt-2 max-h-48 overflow-auto divide-y rounded-md border bg-background">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onLinkExisting(r)
                      setShowSearch(false)
                      setResults([])
                      setQuery("")
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span>
                      <span className="font-medium">{r.firstName} {r.lastName}</span>{" "}
                      <span className="text-muted-foreground">· {r.phone ?? "no phone"}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {r.childCount} child{r.childCount === 1 ? "" : "ren"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">First name</Label>
          <Input value={value.firstName} onChange={(e) => onChange({ firstName: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Last name</Label>
          <Input value={value.lastName} onChange={(e) => onChange({ lastName: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Relationship</Label>
          <Input
            value={value.relationship}
            onChange={(e) => onChange({ relationship: e.target.value })}
            placeholder="Father / Mother / Guardian"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Phone</Label>
          <Input
            value={value.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="+2348012345678"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Email</Label>
          <Input
            type="email"
            value={value.email ?? ""}
            onChange={(e) => onChange({ email: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Occupation</Label>
          <Input value={value.occupation ?? ""} onChange={(e) => onChange({ occupation: e.target.value })} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Address</Label>
          <Input value={value.address ?? ""} onChange={(e) => onChange({ address: e.target.value })} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.isEmergencyContact}
            onChange={(e) => onChange({ isEmergencyContact: e.target.checked })}
          />
          Emergency contact
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.canPickup}
            onChange={(e) => onChange({ canPickup: e.target.checked })}
          />
          Authorised to pick up
        </label>
      </div>
    </div>
  )
}
