"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DEFAULT_GRADE_TEMPLATE,
  DEFAULT_MIDTERM_TEMPLATE,
  type GradeSection,
  type MidtermSection,
  type ReportTemplateConfig,
} from "@/lib/report-template"
import type { CurriculumDTO } from "@/components/dashboard/settings/curricula-tab"

export type ReportTemplateDTO = {
  id: string
  kind: "GRADE" | "MIDTERM"
  name: string
  curriculumId: string | null
  isDefault: boolean
  config: unknown // ReportTemplateConfig at runtime
}

const ANY_CURRICULUM = "__any__"

const GRADE_SECTIONS: { key: GradeSection; label: string }[] = [
  { key: "student-info", label: "Student info + attendance" },
  { key: "subjects-table", label: "Subjects table" },
  { key: "totals", label: "Totals (total, average, position)" },
  { key: "class-teacher-comment", label: "Class teacher comment" },
  { key: "principal-comment", label: "Principal comment" },
  { key: "signatures", label: "Signature lines" },
  { key: "next-term-banner", label: "Next-term banner (footer)" },
]

const MIDTERM_SECTIONS: { key: MidtermSection; label: string }[] = [
  { key: "student-info", label: "Student info" },
  { key: "subjects-table", label: "Subjects table" },
  { key: "totals", label: "Totals + attendance" },
  { key: "class-teacher-comment", label: "Class teacher comment" },
  { key: "principal-comment", label: "Principal comment" },
  { key: "signatures", label: "Signature lines" },
]

const COLOR_FIELDS = [
  { key: "primary" as const, label: "Primary (school name, title)" },
  { key: "accent" as const, label: "Accent (table header bg)" },
  { key: "headerBorder" as const, label: "Header border" },
  { key: "totalsBorder" as const, label: "Totals card border" },
  { key: "positive" as const, label: "Positive (pass grades)" },
  { key: "negative" as const, label: "Negative (fail grades)" },
  { key: "bodyText" as const, label: "Body text" },
  { key: "mutedText" as const, label: "Muted text" },
]

const HEADER_LAYOUTS = [
  { value: "left-logo", label: "Left-aligned (default)" },
  { value: "centered", label: "Centered" },
  { value: "right-logo", label: "Right-aligned" },
] as const

export function TemplatesTab({
  templates,
  curricula,
}: {
  templates: ReportTemplateDTO[]
  curricula: CurriculumDTO[]
}) {
  const grade = templates.filter((t) => t.kind === "GRADE")
  const midterm = templates.filter((t) => t.kind === "MIDTERM")

  return (
    <div className="space-y-4">
      <Tabs defaultValue="GRADE" className="space-y-4">
        <TabsList>
          <TabsTrigger value="GRADE">Grade report card</TabsTrigger>
          <TabsTrigger value="MIDTERM">Midterm report</TabsTrigger>
        </TabsList>
        <TabsContent value="GRADE">
          <TemplateList kind="GRADE" templates={grade} curricula={curricula} />
        </TabsContent>
        <TabsContent value="MIDTERM">
          <TemplateList kind="MIDTERM" templates={midterm} curricula={curricula} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TemplateList({
  kind,
  templates,
  curricula,
}: {
  kind: "GRADE" | "MIDTERM"
  templates: ReportTemplateDTO[]
  curricula: CurriculumDTO[]
}) {
  const curriculumLabel = (id: string | null) => {
    if (!id) return "all curricula"
    return curricula.find((c) => c.id === id)?.code ?? "unknown"
  }
  const router = useRouter()
  const [editing, setEditing] = useState<ReportTemplateDTO | "new" | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function makeDefault(t: ReportTemplateDTO) {
    if (t.isDefault) return
    setBusy(`default-${t.id}`)
    const res = await fetch(`/api/school/report-templates/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    })
    setBusy(null)
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (res.ok) {
      toast.success(`${t.name} is now the default`)
      router.refresh()
    } else {
      toast.error(data.error ?? "Couldn't update")
    }
  }

  async function remove(t: ReportTemplateDTO) {
    if (!confirm(`Delete the ${t.name} template?`)) return
    setBusy(`del-${t.id}`)
    const res = await fetch(`/api/school/report-templates/${t.id}`, {
      method: "DELETE",
    })
    setBusy(null)
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (res.ok) {
      toast.success("Template deleted")
      router.refresh()
    } else {
      toast.error(data.error ?? "Couldn't delete")
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>
              {kind === "GRADE" ? "Grade report-card" : "Midterm report"} templates
            </CardTitle>
            <CardDescription>
              Customise colours, sections, signature lines, and footer text. The
              default applies whenever a {kind === "GRADE" ? "report card" : "midterm report"} PDF
              renders.
            </CardDescription>
          </div>
          <Button type="button" onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" />
            New template
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {templates.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
              <p className="text-sm font-medium">No custom templates yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The built-in default is in use. Create a template to override colours,
                sections, or footer text.
              </p>
            </div>
          ) : null}

          {templates.map((t) => (
            <div key={t.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{t.name}</span>
                    <Badge variant="outline" className="text-xs">
                      Scope: {curriculumLabel(t.curriculumId)}
                    </Badge>
                    {t.isDefault && (
                      <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 text-xs">
                        Default · {curriculumLabel(t.curriculumId)}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!t.isDefault && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => makeDefault(t)}
                      disabled={busy === `default-${t.id}`}
                      title="Make default"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setEditing(t)}
                    aria-label="Edit template"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(t)}
                    disabled={busy === `del-${t.id}`}
                    aria-label="Delete template"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {editing && (
        <TemplateEditor
          kind={kind}
          editing={editing}
          curricula={curricula}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

function emptyFormFor(kind: "GRADE" | "MIDTERM"): {
  name: string
  isDefault: boolean
  config: ReportTemplateConfig
} {
  const config =
    kind === "GRADE"
      ? structuredClone(DEFAULT_GRADE_TEMPLATE)
      : structuredClone(DEFAULT_MIDTERM_TEMPLATE)
  return { name: "", isDefault: false, config }
}

function TemplateEditor({
  kind,
  editing,
  curricula,
  onClose,
  onSaved,
}: {
  kind: "GRADE" | "MIDTERM"
  editing: ReportTemplateDTO | "new"
  curricula: CurriculumDTO[]
  onClose: () => void
  onSaved: () => void
}) {
  const initial =
    editing === "new"
      ? {
          ...emptyFormFor(kind),
          curriculumId: null as string | null,
        }
      : {
          name: editing.name,
          isDefault: editing.isDefault,
          config: editing.config as ReportTemplateConfig,
          curriculumId: editing.curriculumId,
        }

  const [name, setName] = useState(initial.name)
  const [isDefault, setIsDefault] = useState(initial.isDefault)
  const [config, setConfig] = useState<ReportTemplateConfig>(initial.config)
  const [curriculumId, setCurriculumId] = useState<string | null>(initial.curriculumId)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  const sectionCatalog = (kind === "GRADE" ? GRADE_SECTIONS : MIDTERM_SECTIONS) as {
    key: string
    label: string
  }[]

  function setColor(field: (typeof COLOR_FIELDS)[number]["key"], value: string) {
    setConfig((c) => ({ ...c, colors: { ...c.colors, [field]: value } }))
  }

  function setWatermarkColor(value: string) {
    setConfig((c) => ({ ...c, colors: { ...c.colors, watermark: value } }))
  }

  function toggleSection(key: string) {
    setConfig((c) => {
      const list = c.sections as string[]
      const next = list.includes(key) ? list.filter((s) => s !== key) : [...list, key]
      return { ...c, sections: next as ReportTemplateConfig["sections"] }
    })
  }

  function moveSection(key: string, dir: -1 | 1) {
    setConfig((c) => {
      const list = c.sections as string[]
      const i = list.indexOf(key)
      if (i < 0) return c
      const j = i + dir
      if (j < 0 || j >= list.length) return c
      const next = [...list]
      const tmp = next[i]
      next[i] = next[j]
      next[j] = tmp
      return { ...c, sections: next as ReportTemplateConfig["sections"] }
    })
  }

  function setSignature(i: number, label: string) {
    setConfig((c) => ({
      ...c,
      signatures: c.signatures.map((s, idx) => (idx === i ? { label } : s)),
    }))
  }

  function addSignature() {
    setConfig((c) => ({ ...c, signatures: [...c.signatures, { label: "" }] }))
  }

  function removeSignature(i: number) {
    setConfig((c) => ({
      ...c,
      signatures: c.signatures.filter((_, idx) => idx !== i),
    }))
  }

  async function save() {
    if (!name.trim()) {
      toast.error("Name required")
      return
    }
    if (config.signatures.some((s) => !s.label.trim())) {
      toast.error("Signature labels can't be blank")
      return
    }
    if (config.sections.length === 0) {
      toast.error("Pick at least one section")
      return
    }
    setSaving(true)
    const payload = {
      kind,
      name: name.trim(),
      isDefault,
      config,
      curriculumId,
    }
    const res =
      editing === "new"
        ? await fetch("/api/school/report-templates", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/school/report-templates/${editing.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: name.trim(),
              isDefault,
              config,
              curriculumId,
            }),
          })
    setSaving(false)
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "Couldn't save")
      return
    }
    toast.success(editing === "new" ? "Template created" : "Template updated")
    onSaved()
  }

  async function preview() {
    setPreviewing(true)
    const res = await fetch("/api/school/report-templates/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, config }),
    })
    setPreviewing(false)
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      toast.error(data.error ?? "Couldn't render preview")
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank", "noopener,noreferrer")
    // Don't revoke immediately — the new tab still needs the blob URL. The
    // browser will GC it on tab close.
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing === "new"
              ? `New ${kind === "GRADE" ? "grade" : "midterm"} template`
              : `Edit ${initial.name}`}
          </DialogTitle>
          <DialogDescription>
            Adjust colours and which sections render. The "Generate preview" button
            renders a sample PDF using the first active student + current term.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[2fr_1.2fr]">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name" className="text-xs">Name</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "GRADE" ? "Junior senior report card" : "Junior midterm"}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Curriculum scope</Label>
            <Select
              value={curriculumId ?? ANY_CURRICULUM}
              onValueChange={(v) => setCurriculumId(v === ANY_CURRICULUM ? null : v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_CURRICULUM}>Any curriculum (fallback)</SelectItem>
                {curricula.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Curriculum-specific templates win over the fallback when rendering a class
              on that curriculum.
            </p>
          </div>
        </div>

        <fieldset className="rounded-md border p-3 space-y-3">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">
            Header
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Layout</Label>
              <Select
                value={config.header.layout}
                onValueChange={(v) =>
                  setConfig((c) => ({
                    ...c,
                    header: { ...c.header, layout: v as ReportTemplateConfig["header"]["layout"] },
                  }))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HEADER_LAYOUTS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Title override (optional)</Label>
              <Input
                value={config.header.titleOverride ?? ""}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    header: {
                      ...c.header,
                      titleOverride: e.target.value || undefined,
                    },
                  }))
                }
                placeholder={kind === "GRADE" ? "Terminal report" : "Midterm assessment"}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={config.header.showLogo}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    header: { ...c.header, showLogo: e.target.checked },
                  }))
                }
              />
              Show school logo
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={config.header.showMotto}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    header: { ...c.header, showMotto: e.target.checked },
                  }))
                }
              />
              Show motto
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={config.header.showSlogan}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    header: { ...c.header, showSlogan: e.target.checked },
                  }))
                }
              />
              Show slogan
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded-md border p-3 space-y-2">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">
            Colours
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {COLOR_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 p-2">
                <span className="text-xs">{f.label}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.colors[f.key]}
                    onChange={(e) => setColor(f.key, e.target.value)}
                    className="h-7 w-10 cursor-pointer rounded border"
                    aria-label={f.label}
                  />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {config.colors[f.key]}
                  </span>
                </div>
              </div>
            ))}
            {kind === "MIDTERM" && (
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 p-2">
                <span className="text-xs">Watermark</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.colors.watermark ?? "#fee2c2"}
                    onChange={(e) => setWatermarkColor(e.target.value)}
                    className="h-7 w-10 cursor-pointer rounded border"
                    aria-label="Watermark colour"
                  />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {config.colors.watermark ?? "#fee2c2"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </fieldset>

        <fieldset className="rounded-md border p-3 space-y-2">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">
            Sections (order + visibility)
          </legend>
          <div className="space-y-1.5">
            {/* Active sections (in order) shown first; inactive at the bottom. */}
            {sectionCatalog
              .slice()
              .sort((a, b) => {
                const ia = (config.sections as string[]).indexOf(a.key)
                const ib = (config.sections as string[]).indexOf(b.key)
                if (ia === -1 && ib === -1) return 0
                if (ia === -1) return 1
                if (ib === -1) return -1
                return ia - ib
              })
              .map((s) => {
                const active = (config.sections as string[]).includes(s.key)
                return (
                  <div
                    key={s.key}
                    className={`flex items-center gap-2 rounded-md border p-2 text-sm ${
                      active ? "bg-background" : "bg-muted/30 opacity-70"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleSection(s.key)}
                    />
                    <span className="flex-1">{s.label}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => moveSection(s.key, -1)}
                      disabled={!active}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => moveSection(s.key, 1)}
                      disabled={!active}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })}
          </div>
        </fieldset>

        <fieldset className="rounded-md border p-3 space-y-2">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">
            Signature lines
          </legend>
          {config.signatures.map((sig, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={sig.label}
                onChange={(e) => setSignature(i, e.target.value)}
                placeholder="Class teacher"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeSignature(i)}
                aria-label="Remove signature"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={addSignature}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add signature
          </Button>
        </fieldset>

        <fieldset className="rounded-md border p-3 space-y-2">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">
            Custom text
          </legend>
          <div className="space-y-1.5">
            <Label className="text-xs">Footer text</Label>
            <Input
              value={config.customText.footer ?? ""}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  customText: { ...c.customText, footer: e.target.value || undefined },
                }))
              }
              placeholder="Generated by EduCore Africa"
            />
          </div>
          {kind === "GRADE" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Next-term prefix (footer)</Label>
              <Input
                value={config.customText.nextTermPrefix ?? ""}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    customText: {
                      ...c.customText,
                      nextTermPrefix: e.target.value || undefined,
                    },
                  }))
                }
                placeholder="Next term begins"
              />
            </div>
          )}
          {kind === "MIDTERM" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Watermark text</Label>
              <Input
                value={config.customText.watermark ?? ""}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    customText: {
                      ...c.customText,
                      watermark: e.target.value || undefined,
                    },
                  }))
                }
                placeholder="MIDTERM"
              />
            </div>
          )}
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            disabled={editing !== "new" && (editing as ReportTemplateDTO).isDefault}
          />
          Make this the default for{" "}
          {curriculumId
            ? (curricula.find((c) => c.id === curriculumId)?.name ?? "this curriculum")
            : "all curricula (fallback)"}
        </label>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={preview}
            disabled={previewing}
          >
            {previewing ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Eye className="mr-1.5 h-4 w-4" />
            )}
            Generate preview
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

