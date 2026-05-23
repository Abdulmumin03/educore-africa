"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Plus, Trash2, Download, Upload, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const CATEGORIES = ["CORE", "ELECTIVE", "TRADE"] as const

const newSubjectSchema = z.object({
  name: z.string().trim().min(2),
  code: z.string().trim().min(2).max(15),
  category: z.enum(CATEGORIES),
  creditUnits: z.number().int().min(1).max(10),
  isActive: z.boolean(),
})

type NewSubjectInput = z.infer<typeof newSubjectSchema>

export type SubjectDTO = {
  id: string
  name: string
  code: string
  category: (typeof CATEGORIES)[number]
  creditUnits: number
  isCore: boolean
  isActive: boolean
}

export function SubjectsTab({ subjects }: { subjects: SubjectDTO[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewSubjectInput>({
    resolver: zodResolver(newSubjectSchema),
    defaultValues: { category: "CORE", creditUnits: 1, isActive: true },
  })
  const category = watch("category")
  const isActive = watch("isActive")

  async function onAdd(values: NewSubjectInput) {
    const res = await fetch("/api/school/subjects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "Couldn't add subject")
      return
    }
    toast.success("Subject added")
    reset({ category: "CORE", creditUnits: 1, isActive: true })
    router.refresh()
  }

  async function toggleActive(id: string, next: boolean) {
    setBusy(`active-${id}`)
    const res = await fetch(`/api/school/subjects/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: next }),
    })
    setBusy(null)
    if (res.ok) router.refresh()
    else toast.error("Couldn't update")
  }

  async function deleteSubject(id: string) {
    if (!confirm("Delete this subject? It will be soft-deleted.")) return
    setBusy(`del-${id}`)
    const res = await fetch(`/api/school/subjects/${id}`, { method: "DELETE" })
    setBusy(null)
    if (res.ok) {
      toast.success("Subject deleted")
      router.refresh()
    } else toast.error("Couldn't delete")
  }

  function downloadTemplate() {
    const csv = "name,code,category,creditUnits,isActive\nMathematics,MTH,CORE,1,true\nFurther Maths,FMT,ELECTIVE,1,true\n"
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "subjects-template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onImport(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const res = await fetch("/api/school/subjects/import", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: text,
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        imported?: number
        skipped?: number
        error?: string
      }
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Import failed")
        return
      }
      toast.success(`Imported ${data.imported ?? 0} subjects (${data.skipped ?? 0} skipped)`)
      router.refresh()
    } finally {
      setImporting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Subjects</CardTitle>
          <CardDescription>
            WAEC categories, credit units, and activation per term.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="mr-1.5 h-4 w-4" />
            CSV template
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onImport(file)
              }}
            />
            <Button type="button" variant="outline" size="sm" asChild>
              <span>
                {importing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-4 w-4" />
                )}
                Import CSV
              </span>
            </Button>
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={handleSubmit(onAdd)}
          className="grid gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-[1.5fr_1fr_1fr_0.7fr_auto_auto]"
        >
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input {...register("name")} placeholder="Mathematics" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Code</Label>
            <Input {...register("code")} placeholder="MTH" />
            {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={(v) => setValue("category", v as typeof category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Credits</Label>
            <Input type="number" min={1} max={10} {...register("creditUnits", { valueAsNumber: true })} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setValue("isActive", e.target.checked)}
              />
              Active
            </label>
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm" disabled={isSubmitting}>
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </form>

        {subjects.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
            <p className="text-sm font-medium">No subjects yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add subjects above, or import a CSV (template available).
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.code}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <Badge variant={s.category === "CORE" ? "default" : "secondary"}>
                        {s.category}
                      </Badge>
                    </TableCell>
                    <TableCell>{s.creditUnits}</TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={s.isActive}
                        disabled={busy === `active-${s.id}`}
                        onChange={(e) => toggleActive(s.id, e.target.checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteSubject(s.id)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
