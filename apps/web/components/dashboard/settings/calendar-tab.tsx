"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import dayjs from "dayjs"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export type TermDTO = {
  id: string
  type: "FIRST" | "SECOND" | "THIRD"
  startDate: string
  endDate: string
  isCurrent: boolean
}

export type AcademicYearDTO = {
  id: string
  name: string
  startDate: string
  endDate: string
  isCurrent: boolean
  terms: TermDTO[]
}

export type HolidayDTO = {
  id: string
  name: string
  startDate: string
  endDate: string
  description: string | null
}

const newAYSchema = z.object({
  name: z.string().regex(/^\d{4}\/\d{4}$/, "Use format YYYY/YYYY"),
  startDate: z.string(),
  endDate: z.string(),
})

const newHolidaySchema = z
  .object({
    name: z.string().min(2),
    startDate: z.string(),
    endDate: z.string(),
    description: z.string().optional(),
  })
  .refine((d) => new Date(d.endDate) >= new Date(d.startDate), {
    path: ["endDate"],
    message: "End date must be after start",
  })

type NewAYInput = z.infer<typeof newAYSchema>
type NewHolidayInput = z.infer<typeof newHolidaySchema>

export function CalendarTab({
  academicYears,
  holidays,
}: {
  academicYears: AcademicYearDTO[]
  holidays: HolidayDTO[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function setCurrent(ayId: string) {
    setBusy(ayId)
    const res = await fetch(`/api/school/academic-years/${ayId}/set-current`, { method: "POST" })
    setBusy(null)
    if (res.ok) {
      toast.success("Current session updated")
      router.refresh()
    } else toast.error("Couldn't update")
  }

  async function setCurrentTerm(termId: string) {
    setBusy(termId)
    const res = await fetch(`/api/school/terms/${termId}/set-current`, { method: "POST" })
    setBusy(null)
    if (res.ok) {
      toast.success("Current term updated")
      router.refresh()
    } else toast.error("Couldn't update")
  }

  async function deleteHoliday(id: string) {
    setBusy(id)
    const res = await fetch(`/api/school/holidays/${id}`, { method: "DELETE" })
    setBusy(null)
    if (res.ok) {
      toast.success("Holiday removed")
      router.refresh()
    } else toast.error("Couldn't remove holiday")
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Academic sessions</CardTitle>
              <CardDescription>Define sessions and their 3 terms.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {academicYears.length === 0 ? (
              <EmptyState
                title="No sessions yet"
                hint="Create your first academic session to begin scheduling terms."
              />
            ) : null}
            {academicYears.map((ay) => (
              <div key={ay.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{ay.name}</span>
                      {ay.isCurrent && <Badge variant="secondary">Current</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {dayjs(ay.startDate).format("D MMM YYYY")} —{" "}
                      {dayjs(ay.endDate).format("D MMM YYYY")}
                    </p>
                  </div>
                  {!ay.isCurrent && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrent(ay.id)}
                      disabled={busy === ay.id}
                    >
                      Set current
                    </Button>
                  )}
                </div>
                <ul className="mt-3 space-y-1.5">
                  {ay.terms.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{t.type[0] + t.type.slice(1).toLowerCase()} term</span>
                        <span className="text-xs text-muted-foreground">
                          {dayjs(t.startDate).format("D MMM")} – {dayjs(t.endDate).format("D MMM")}
                        </span>
                        {t.isCurrent && <Badge variant="secondary">Active</Badge>}
                      </div>
                      {!t.isCurrent && (
                        <button
                          type="button"
                          onClick={() => setCurrentTerm(t.id)}
                          disabled={busy === t.id}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Make current
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <AddAcademicYearForm onCreated={() => router.refresh()} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Holidays</CardTitle>
            <CardDescription>Days off that show on the term calendar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {holidays.length === 0 ? (
              <EmptyState
                title="No holidays yet"
                hint="Add holidays to block attendance and timetable conflicts."
              />
            ) : null}
            <ul className="space-y-2">
              {holidays.map((h) => (
                <li
                  key={h.id}
                  className="flex items-start justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{h.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {dayjs(h.startDate).format("D MMM")} – {dayjs(h.endDate).format("D MMM YYYY")}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => deleteHoliday(h.id)}
                    aria-label="Remove holiday"
                    disabled={busy === h.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <AddHolidayForm onCreated={() => router.refresh()} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function AddAcademicYearForm({ onCreated }: { onCreated: () => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewAYInput>({
    resolver: zodResolver(newAYSchema),
    defaultValues: {
      name: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
      startDate: dayjs(new Date()).format("YYYY-09-01"),
      endDate: dayjs(new Date()).add(1, "year").format("YYYY-07-31"),
    },
  })

  async function onSubmit(values: NewAYInput) {
    const res = await fetch("/api/school/academic-years", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "Couldn't create session")
      return
    }
    toast.success("Session created with 3 default terms")
    reset()
    onCreated()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <div className="space-y-1">
        <Label className="text-xs">Session</Label>
        <Input {...register("name")} placeholder="2025/2026" />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Start date</Label>
        <Input type="date" {...register("startDate")} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">End date</Label>
        <Input type="date" {...register("endDate")} />
      </div>
      <div className="flex items-end">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </div>
    </form>
  )
}

function AddHolidayForm({ onCreated }: { onCreated: () => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewHolidayInput>({
    resolver: zodResolver(newHolidaySchema),
  })

  async function onSubmit(values: NewHolidayInput) {
    const res = await fetch("/api/school/holidays", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "Couldn't add holiday")
      return
    }
    toast.success("Holiday added")
    reset()
    onCreated()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="space-y-1">
        <Label className="text-xs">Name</Label>
        <Input {...register("name")} placeholder="Easter break" />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Start</Label>
          <Input type="date" {...register("startDate")} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">End</Label>
          <Input type="date" {...register("endDate")} />
          {errors.endDate && <p className="text-xs text-destructive">{errors.endDate.message}</p>}
        </div>
      </div>
      <Button type="submit" size="sm" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add holiday
      </Button>
    </form>
  )
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
