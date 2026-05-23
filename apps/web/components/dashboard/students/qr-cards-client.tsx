"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StudentQrCard, type QrCardStudent } from "@/components/dashboard/students/qr-card"

type ClassOpt = {
  id: string
  name: string
  sections: { id: string; name: string }[]
}

type StudentListResponse = {
  items: Array<{
    id: string
    admissionNumber: string
    firstName: string
    lastName: string
    middleName: string | null
    avatarUrl: string | null
    className: string | null
    sectionName: string | null
  }>
  total: number
}

export function QrCardsClient({
  school,
  classes,
}: {
  school: { name: string; logoUrl: string | null; motto: string | null }
  classes: ClassOpt[]
}) {
  const [classId, setClassId] = useState<string>("all")
  const [sectionId, setSectionId] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const arms = classes.find((c) => c.id === classId)?.sections ?? []

  const query = useMemo(() => {
    const p = new URLSearchParams()
    p.set("limit", "100")
    if (classId !== "all") p.set("classId", classId)
    if (sectionId !== "all") p.set("sectionId", sectionId)
    if (search.trim()) p.set("search", search.trim())
    return p.toString()
  }, [classId, sectionId, search])

  const { data, isLoading } = useQuery<StudentListResponse>({
    queryKey: ["qr-cards-students", query],
    queryFn: async () => {
      const res = await fetch(`/api/students?${query}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAllVisible() {
    if (!data) return
    const visibleIds = data.items.map((s) => s.id)
    const allSelected = visibleIds.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) visibleIds.forEach((id) => next.delete(id))
      else visibleIds.forEach((id) => next.add(id))
      return next
    })
  }

  const selectedStudents: QrCardStudent[] = useMemo(() => {
    if (!data) return []
    return data.items
      .filter((s) => selected.has(s.id))
      .map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        admissionNumber: s.admissionNumber,
        className: s.className,
        sectionName: s.sectionName,
        avatarUrl: s.avatarUrl,
      }))
  }, [data, selected])

  return (
    <div className="space-y-4 print:p-0">
      <div className="flex flex-wrap items-end justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">QR ID cards</h1>
          <p className="text-sm text-muted-foreground">
            Select students, then print double-sided ID cards with QR codes scannable by the
            attendance roll-call screen.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/students">← Back to students</Link>
        </Button>
      </div>

      <Card className="print:hidden">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Class</Label>
            <Select
              value={classId}
              onValueChange={(v) => {
                setClassId(v)
                setSectionId("all")
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Arm</Label>
            <Select value={sectionId} onValueChange={setSectionId} disabled={classId === "all"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All arms</SelectItem>
                {arms.map((s) => (
                  <SelectItem key={s.id} value={s.id}>Arm {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Search</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or admission no."
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-muted-foreground">
          {selected.size} selected
          {data ? ` · ${data.items.length} shown${data.total > data.items.length ? ` of ${data.total}` : ""}` : ""}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={toggleAllVisible} disabled={!data}>
            Select visible
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
            disabled={selected.size === 0}
          >
            Clear
          </Button>
          <Button size="sm" onClick={() => window.print()} disabled={selected.size === 0}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print {selected.size} card{selected.size === 1 ? "" : "s"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground print:hidden">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading students…
        </div>
      ) : !data || data.items.length === 0 ? (
        <Card className="print:hidden">
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            No students match. Adjust filters above.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
          {data.items.map((s) => {
            const isSel = selected.has(s.id)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className={`rounded-md border p-3 text-left text-sm transition ${
                  isSel
                    ? "border-primary bg-primary/5"
                    : "border-input hover:bg-muted/40"
                }`}
              >
                <p className="font-medium">{s.firstName} {s.lastName}</p>
                <p className="text-xs text-muted-foreground">
                  {s.admissionNumber}
                  {s.className ? ` · ${s.className}${s.sectionName ? ` · Arm ${s.sectionName}` : ""}` : ""}
                </p>
              </button>
            )
          })}
        </div>
      )}

      {selectedStudents.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold print:hidden">Preview ({selectedStudents.length})</div>
          <div className="flex flex-wrap gap-3 print:gap-2">
            {selectedStudents.map((s) => (
              <StudentQrCard
                key={s.id}
                student={s}
                schoolName={school.name}
                schoolLogoUrl={school.logoUrl}
                schoolMotto={school.motto}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
