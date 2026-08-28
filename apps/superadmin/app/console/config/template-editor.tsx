"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { Eye, History, Send } from "lucide-react"

import { cn } from "@/lib/utils"

export type TemplateVersion = {
  id: string
  version: number
  subject: string | null
  body: string
  createdAt: string
  editedBy: string | null
}

export type TemplateRow = {
  id: string
  key: string
  label: string
  description: string | null
  subject: string | null
  body: string
  isActive: boolean
  updatedAt: string
  updatedBy: string | null
  unknownTags: string[]
  versions: TemplateVersion[]
  chars?: number
  segments?: number
}

type MergeTag = { tag: string; description: string }

/** One SMS segment; concatenated messages lose 7 characters each to the header. */
const SEGMENT = 160
const MULTIPART = 153

function segmentsFor(body: string): { chars: number; segments: number } {
  const chars = body.length
  if (chars === 0) return { chars: 0, segments: 0 }
  if (chars <= SEGMENT) return { chars, segments: 1 }
  return { chars, segments: Math.ceil(chars / MULTIPART) }
}

export function TemplateEditor({
  kind,
  templates,
  mergeTags,
}: {
  kind: "EMAIL" | "SMS"
  templates: TemplateRow[]
  mergeTags: MergeTag[]
}) {
  const router = useRouter()
  const [selectedId, setSelectedId] = React.useState(templates[0]?.id ?? "")
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0]

  const [subject, setSubject] = React.useState(selected?.subject ?? "")
  const [body, setBody] = React.useState(selected?.body ?? "")
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<{ subject: string | null; body: string } | null>(null)
  const [showHistory, setShowHistory] = React.useState(false)

  const bodyRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    setSubject(selected?.subject ?? "")
    setBody(selected?.body ?? "")
    setPreview(null)
    setMessage(null)
    setError(null)
    setShowHistory(false)
  }, [selectedId, selected])

  const dirty = selected ? subject !== (selected.subject ?? "") || body !== selected.body : false
  const counts = segmentsFor(body)

  /** Drop a merge tag in at the caret rather than at the end. */
  function insertTag(tag: string) {
    const textarea = bodyRef.current
    const token = `{{${tag}}}`
    if (!textarea) {
      setBody((current) => current + token)
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    setBody((current) => current.slice(0, start) + token + current.slice(end))
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start + token.length, start + token.length)
    })
  }

  async function call(path: string, payload: Record<string, unknown>) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    return { ok: response.ok, body: (await response.json()) as Record<string, unknown> }
  }

  async function save() {
    if (!selected) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const endpoint = kind === "EMAIL" ? "email-templates" : "sms-templates"
      const response = await fetch(`/api/config/${endpoint}/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      })
      const payload = (await response.json()) as { error?: string; version?: number; notice?: string }
      if (!response.ok) throw new Error(payload.error ?? "Could not save.")
      setMessage(`${payload.notice ?? "Saved."} (version ${payload.version})`)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  async function runPreview() {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const result = await call(`/api/config/templates/${selected.id}/preview`, { subject, body })
      if (!result.ok) throw new Error((result.body.error as string) ?? "Could not render.")
      setPreview({
        subject: (result.body.subject as string | null) ?? null,
        body: result.body.body as string,
      })
      const unknown = (result.body.unknownTags as string[]) ?? []
      if (unknown.length > 0) {
        setError(`Unrecognised tag(s): ${unknown.map((tag) => `{{${tag}}}`).join(", ")}`)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    if (!selected) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await call(`/api/config/templates/${selected.id}/test-send`, { subject, body })
      const sent = result.body.sent === true
      if (sent) {
        setMessage(`Sent to ${result.body.to as string}.`)
      } else {
        // A test that did not send says so plainly rather than showing a
        // success toast over a message that never left.
        setError((result.body.reason as string) ?? "Nothing was sent.")
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  async function rollback(version: number) {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const result = await call(`/api/config/templates/${selected.id}/rollback`, { version })
      if (!result.ok) throw new Error((result.body.error as string) ?? "Could not roll back.")
      setMessage(result.body.notice as string)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  if (!selected) {
    return (
      <p className="rounded-lg border border-sa-border bg-sa-surface px-4 py-10 text-center text-body text-sa-muted">
        No {kind.toLowerCase()} templates are defined.
      </p>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr_260px]">
      <aside className="space-y-0.5" aria-label="Templates">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            aria-current={template.id === selectedId ? "true" : undefined}
            onClick={() => setSelectedId(template.id)}
            className={cn(
              "w-full rounded-md px-2.5 py-1.5 text-left transition-colors",
              template.id === selectedId
                ? "bg-sa-raised text-sa-text"
                : "text-sa-muted hover:bg-sa-raised/60 hover:text-sa-text",
            )}
          >
            <span className="block text-body">{template.label}</span>
            <span className="block font-mono text-caption text-sa-dim">{template.key}</span>
          </button>
        ))}
      </aside>

      <section className="rounded-lg border border-sa-border bg-sa-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-sa-border px-4 py-2.5">
          <div>
            <h3 className="text-h3">{selected.label}</h3>
            <p className="text-caption text-sa-dim">
              {selected.description ?? "System template"} · last edited{" "}
              {new Date(selected.updatedAt).toLocaleDateString("en-GB")}
              {selected.updatedBy && ` by ${selected.updatedBy}`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void runPreview()}
              disabled={busy}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-sa-border px-2.5 text-caption text-sa-muted transition-colors hover:text-sa-text disabled:opacity-50"
            >
              <Eye className="h-3 w-3" aria-hidden="true" />
              Preview
            </button>
            {kind === "EMAIL" && (
              <button
                type="button"
                onClick={() => void sendTest()}
                disabled={busy}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-sa-border px-2.5 text-caption text-sa-muted transition-colors hover:text-sa-text disabled:opacity-50"
              >
                <Send className="h-3 w-3" aria-hidden="true" />
                Send test
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowHistory((open) => !open)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-sa-border px-2.5 text-caption text-sa-muted transition-colors hover:text-sa-text"
            >
              <History className="h-3 w-3" aria-hidden="true" />
              History ({selected.versions.length})
            </button>
          </div>
        </header>

        <div className="space-y-3 p-4">
          {error && <p className="text-body text-sa-red">{error}</p>}
          {message && <p className="text-body text-sa-green">{message}</p>}

          {kind === "EMAIL" && (
            <label className="block text-caption uppercase tracking-wide text-sa-dim">
              Subject
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
              />
            </label>
          )}

          <label className="block text-caption uppercase tracking-wide text-sa-dim">
            Body
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={kind === "EMAIL" ? 16 : 6}
              className="mt-1 w-full resize-y rounded-md border border-sa-border bg-sa-raised px-2.5 py-2 font-mono text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>

          {kind === "SMS" && (
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "font-mono text-caption tabular-nums",
                  counts.segments > 1 ? "text-sa-amber" : "text-sa-dim",
                )}
              >
                {counts.chars} characters · {counts.segments} segment
                {counts.segments === 1 ? "" : "s"}
              </span>
              <span className="text-caption text-sa-dim">
                {counts.segments > 1
                  ? `Over ${SEGMENT} characters, so it is billed as ${counts.segments} messages at ${MULTIPART} characters each.`
                  : `Up to ${SEGMENT} characters is one message.`}
              </span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={() => void save()}
              className="h-8 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:opacity-40"
            >
              {busy ? "Working…" : "Save"}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setSubject(selected.subject ?? "")
                  setBody(selected.body)
                }}
                className="text-caption text-sa-blue hover:underline"
              >
                Discard changes
              </button>
            )}
          </div>

          {preview && (
            <div className="rounded-md border border-sa-border bg-sa-raised/40 p-3">
              <p className="mb-1.5 text-caption uppercase tracking-wide text-sa-dim">
                Preview with sample values — nothing was sent
              </p>
              {kind === "SMS" ? (
                // Phone mockup: the shape matters, because 3 segments looks
                // very different on a handset from 1.
                <div className="mx-auto w-[260px] rounded-2xl border-2 border-sa-border bg-sa-base p-3">
                  <div className="mb-2 h-1 w-12 rounded-full bg-sa-border" />
                  <div className="rounded-2xl rounded-bl-sm bg-sa-blue/20 px-3 py-2">
                    <p className="whitespace-pre-wrap text-caption text-sa-text">{preview.body}</p>
                  </div>
                  <p className="mt-1 text-right font-mono text-[10px] text-sa-dim">
                    {segmentsFor(preview.body).segments} segment
                    {segmentsFor(preview.body).segments === 1 ? "" : "s"}
                  </p>
                </div>
              ) : (
                <>
                  {preview.subject && (
                    <p className="mb-2 border-b border-sa-border pb-2 text-body font-medium text-sa-text">
                      {preview.subject}
                    </p>
                  )}
                  <div
                    className="prose-sm max-w-none whitespace-pre-wrap text-body text-sa-muted"
                    // Preview only, rendered from a template the console's own
                    // staff authored and the save path tag-checks.
                    dangerouslySetInnerHTML={{ __html: preview.body }}
                  />
                </>
              )}
            </div>
          )}

          {showHistory && (
            <div className="rounded-md border border-sa-border">
              <p className="border-b border-sa-border px-3 py-1.5 text-caption uppercase tracking-wide text-sa-dim">
                Last {selected.versions.length} version{selected.versions.length === 1 ? "" : "s"}
              </p>
              {selected.versions.length === 0 ? (
                <p className="px-3 py-3 text-caption text-sa-dim">
                  No edits recorded yet — the first save creates version 1.
                </p>
              ) : (
                <ul>
                  {selected.versions.map((version) => (
                    <li
                      key={version.id}
                      className="flex items-start justify-between gap-3 border-b border-sa-border/60 px-3 py-2 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-caption text-sa-text">
                          Version {version.version} ·{" "}
                          {new Date(version.createdAt).toLocaleString("en-GB")}
                          {version.editedBy && ` · ${version.editedBy}`}
                        </p>
                        <p className="truncate font-mono text-caption text-sa-dim">
                          {version.body.slice(0, 90)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void rollback(version.version)}
                        className="h-7 shrink-0 rounded-md border border-sa-border px-2.5 text-caption text-sa-muted transition-colors hover:text-sa-text disabled:opacity-50"
                      >
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>

      <aside className="rounded-lg border border-sa-border bg-sa-surface" aria-label="Merge tags">
        <p className="border-b border-sa-border px-3 py-2 text-caption uppercase tracking-wide text-sa-dim">
          Merge tags
        </p>
        <ul className="p-2">
          {mergeTags.map((tag) => (
            <li key={tag.tag}>
              <button
                type="button"
                onClick={() => insertTag(tag.tag)}
                className="w-full rounded px-1.5 py-1 text-left transition-colors hover:bg-sa-raised"
              >
                <span className="block font-mono text-caption text-sa-blue">{`{{${tag.tag}}}`}</span>
                <span className="block text-caption text-sa-dim">{tag.description}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-sa-border px-3 py-2 text-caption text-sa-dim">
          A tag that is not on this list is refused on save — an unsubstituted{" "}
          <span className="font-mono">{`{{typo}}`}</span> would otherwise reach the recipient as
          written.
        </p>
      </aside>
    </div>
  )
}
