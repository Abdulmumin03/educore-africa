"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { AlertTriangle, Send } from "lucide-react"

import { cn } from "@/lib/utils"

type Audience = "ALL" | "BY_PLAN" | "BY_STATE" | "BY_STATUS" | "CUSTOM"

type Preview = {
  schools: number
  recipients: number
  sample: Array<{
    id: string
    name: string
    state: string | null
    subscription: { plan: string; status: string } | null
  }>
}

type SendResult = {
  broadcastId: string
  schools: number
  recipients: number
  inAppSent: number
  deferred: Array<{ channel: string; reason: string }>
}

const AUDIENCES: Array<{ value: Audience; label: string; hint: string }> = [
  { value: "ALL", label: "Every school", hint: "All active tenants" },
  { value: "BY_PLAN", label: "By plan", hint: "Pick one or more plan tiers" },
  { value: "BY_STATE", label: "By state", hint: "Pick one or more states" },
  { value: "BY_STATUS", label: "By subscription status", hint: "Trial, active, past due…" },
  { value: "CUSTOM", label: "Named schools", hint: "Pick individual schools" },
]

const CHANNELS: Array<{ value: string; label: string; dispatched: boolean; note: string }> = [
  { value: "IN_APP", label: "In-app inbox", dispatched: true, note: "Delivered immediately by the console" },
  {
    value: "EMAIL",
    label: "Email",
    dispatched: false,
    note: "Recorded as requested — the school app owns the mail sender",
  },
  {
    value: "SMS",
    label: "SMS",
    dispatched: false,
    note: "Recorded as requested — billed against each school's own credit",
  },
]

export function BroadcastComposer({
  plans,
  states,
  statuses,
  schools,
}: {
  plans: Array<{ value: string; label: string; count: number }>
  states: Array<{ value: string; count: number }>
  statuses: Array<{ value: string; label: string; count: number }>
  schools: Array<{ id: string; name: string }>
}) {
  const router = useRouter()

  const [title, setTitle] = React.useState("")
  const [body, setBody] = React.useState("")
  const [audience, setAudience] = React.useState<Audience>("ALL")
  const [selection, setSelection] = React.useState<string[]>([])
  const [channels, setChannels] = React.useState<string[]>(["IN_APP"])

  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const [result, setResult] = React.useState<SendResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const filter = React.useMemo(() => {
    switch (audience) {
      case "BY_PLAN":
        return { plans: selection }
      case "BY_STATE":
        return { states: selection }
      case "BY_STATUS":
        return { statuses: selection }
      case "CUSTOM":
        return { schoolIds: selection }
      default:
        return {}
    }
  }, [audience, selection])

  // Recount whenever the target changes. The number on the confirm button has
  // to be the number the send will actually use, so it comes from the same
  // audience predicate rather than a client-side estimate.
  React.useEffect(() => {
    let cancelled = false
    setPreview(null)
    setConfirming(false)

    if (audience !== "ALL" && selection.length === 0) return

    void (async () => {
      try {
        const response = await fetch("/api/broadcast/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audience, filter }),
        })
        if (!response.ok) return
        const data = (await response.json()) as Preview
        if (!cancelled) setPreview(data)
      } catch {
        // A failed preview should not block composing; the send still counts.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [audience, selection, filter])

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
  }

  const options =
    audience === "BY_PLAN"
      ? plans.map((plan) => ({ value: plan.value, label: `${plan.label} (${plan.count})` }))
      : audience === "BY_STATE"
        ? states.map((state) => ({ value: state.value, label: `${state.value} (${state.count})` }))
        : audience === "BY_STATUS"
          ? statuses.map((status) => ({ value: status.value, label: `${status.label} (${status.count})` }))
          : audience === "CUSTOM"
            ? schools.map((school) => ({ value: school.id, label: school.name }))
            : []

  const ready =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    channels.length > 0 &&
    (audience === "ALL" || selection.length > 0)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), audience, filter, channels }),
      })
      const data = (await response.json()) as SendResult & { error?: string }
      if (!response.ok) throw new Error(data.error ?? "Could not send the broadcast.")
      setResult(data)
      setConfirming(false)
      setTitle("")
      setBody("")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {result && (
        <div className="rounded-lg border border-sa-green/40 bg-sa-green/5 p-4">
          <p className="text-body font-medium text-sa-green">
            Sent to {result.recipients} recipient{result.recipients === 1 ? "" : "s"} across{" "}
            {result.schools} school{result.schools === 1 ? "" : "s"}.
          </p>
          <p className="mt-1 text-caption text-sa-muted">
            {result.inAppSent} in-app notification{result.inAppSent === 1 ? "" : "s"} written.
          </p>
          {result.deferred.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.deferred.map((entry) => (
                <li key={entry.channel} className="flex gap-2 text-caption text-sa-amber">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    <strong className="font-medium">{entry.channel}:</strong> {entry.reason}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="rounded-lg border border-sa-border bg-sa-surface">
          <header className="border-b border-sa-border px-4 py-2.5">
            <h2 className="text-h3">Compose</h2>
          </header>
          <div className="space-y-3 p-4">
            <div>
              <label htmlFor="bc-title" className="mb-1 block text-caption uppercase tracking-wide text-sa-dim">
                Title
              </label>
              <input
                id="bc-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={140}
                className="h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body text-sa-text placeholder:text-sa-disabled focus:border-sa-blue focus:outline-none"
                placeholder="Scheduled maintenance on Saturday"
              />
            </div>

            <div>
              <label htmlFor="bc-body" className="mb-1 block text-caption uppercase tracking-wide text-sa-dim">
                Message
              </label>
              <textarea
                id="bc-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={8}
                className="w-full resize-none rounded-md border border-sa-border bg-sa-raised px-2.5 py-2 text-body text-sa-text placeholder:text-sa-disabled focus:border-sa-blue focus:outline-none"
                placeholder="What school administrators need to know."
              />
              <p className="mt-1 text-caption text-sa-dim">{body.length} characters</p>
            </div>

            <fieldset>
              <legend className="mb-1.5 text-caption uppercase tracking-wide text-sa-dim">Channels</legend>
              <div className="space-y-1.5">
                {CHANNELS.map((channel) => (
                  <label
                    key={channel.value}
                    className="flex cursor-pointer items-start gap-2 rounded-md border border-sa-border bg-sa-raised/40 p-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={channels.includes(channel.value)}
                      onChange={() => setChannels((current) => toggle(current, channel.value))}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-sa-border bg-sa-raised"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-body text-sa-text">
                        {channel.label}
                        {!channel.dispatched && (
                          <span className="rounded border border-sa-amber/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sa-amber">
                            not sent from here
                          </span>
                        )}
                      </span>
                      <span className="block text-caption text-sa-dim">{channel.note}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </section>

        <section className="rounded-lg border border-sa-border bg-sa-surface">
          <header className="border-b border-sa-border px-4 py-2.5">
            <h2 className="text-h3">Audience</h2>
          </header>
          <div className="space-y-3 p-4">
            <div className="space-y-0.5">
              {AUDIENCES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={audience === option.value}
                  onClick={() => {
                    setAudience(option.value)
                    setSelection([])
                  }}
                  className={cn(
                    "w-full rounded-md px-2.5 py-1.5 text-left transition-colors",
                    audience === option.value
                      ? "bg-sa-raised text-sa-text"
                      : "text-sa-muted hover:bg-sa-raised/60 hover:text-sa-text",
                  )}
                >
                  <span className="block text-body">{option.label}</span>
                  <span className="block text-caption text-sa-dim">{option.hint}</span>
                </button>
              ))}
            </div>

            {options.length > 0 && (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-sa-border p-2">
                {options.map((option) => (
                  <label key={option.value} className="flex cursor-pointer items-center gap-2 text-body text-sa-muted">
                    <input
                      type="checkbox"
                      checked={selection.includes(option.value)}
                      onChange={() => setSelection((current) => toggle(current, option.value))}
                      className="h-3.5 w-3.5 rounded border-sa-border bg-sa-raised"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            )}

            <div className="rounded-md border border-sa-border bg-sa-raised/40 p-3">
              <p className="text-caption uppercase tracking-wide text-sa-dim">Will reach</p>
              {preview ? (
                <>
                  <p className="font-mono text-h1 tabular-nums text-sa-text">
                    {preview.recipients}
                    <span className="ml-1.5 text-caption font-normal text-sa-dim">
                      admin{preview.recipients === 1 ? "" : "s"}
                    </span>
                  </p>
                  <p className="text-caption text-sa-dim">
                    across {preview.schools} school{preview.schools === 1 ? "" : "s"}
                  </p>
                  {preview.sample.length > 0 && (
                    <p className="mt-1.5 text-caption text-sa-dim">
                      e.g. {preview.sample.map((school) => school.name).join(", ")}
                      {preview.schools > preview.sample.length && ", …"}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-body text-sa-dim">
                  {audience !== "ALL" && selection.length === 0
                    ? "Pick at least one value."
                    : "Counting…"}
                </p>
              )}
            </div>

            {error && <p className="text-body text-sa-red">{error}</p>}

            {confirming ? (
              <div className="space-y-2 rounded-md border border-sa-amber/40 bg-sa-amber/5 p-3">
                <p className="text-body text-sa-text">
                  Send to {preview?.recipients ?? "?"} school administrator
                  {preview?.recipients === 1 ? "" : "s"}? This cannot be recalled.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void send()}
                    className="h-8 flex-1 rounded-md bg-sa-amber px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-amber/90 disabled:opacity-50"
                  >
                    {busy ? "Sending…" : "Yes, send it"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirming(false)}
                    className="h-8 rounded-md border border-sa-border px-3 text-body text-sa-muted transition-colors hover:text-sa-text"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={!ready}
                onClick={() => setConfirming(true)}
                className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                Review and send
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
