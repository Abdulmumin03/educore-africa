"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus } from "lucide-react"

import { useToast } from "@/hooks/use-toast"

const CATEGORIES = ["SALES", "SUPPORT", "CALL", "ONBOARDING", "GENERAL"] as const

export function AddNoteForm({ schoolId, viewerId }: { schoolId: string; viewerId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [body, setBody] = React.useState("")
  const [category, setCategory] = React.useState<(typeof CATEGORIES)[number]>("GENERAL")
  const [pending, setPending] = React.useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!body.trim()) return

    setPending(true)
    try {
      const response = await fetch(`/api/schools/${schoolId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, category }),
      })
      const payload = await response.json()

      if (!response.ok) {
        toast({ variant: "destructive", title: "Could not save the note", description: payload.error })
        return
      }

      setBody("")
      setOpen(false)
      toast({ title: "Note added" })
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Could not reach the server" })
    } finally {
      setPending(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-viewer={viewerId}
        className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-sa-border-em bg-sa-surface text-body font-medium transition-colors hover:bg-sa-raised"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Add note
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={3}
        autoFocus
        maxLength={4000}
        placeholder="What happened? Who did you speak to?"
        className="w-full rounded-md border border-sa-border-em bg-sa-base p-2.5 text-body text-sa-text placeholder:text-sa-dim focus:border-sa-blue focus:outline-none focus:ring-2 focus:ring-sa-blue/20"
      />
      <div className="flex items-center gap-2">
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as (typeof CATEGORIES)[number])}
          aria-label="Note category"
          className="h-8 rounded-md border border-sa-border-em bg-sa-surface px-2 text-body capitalize text-sa-text focus:border-sa-blue focus:outline-none"
        >
          {CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {value.toLowerCase()}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          Save
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-8 items-center rounded-md px-2.5 text-body text-sa-muted transition-colors hover:text-sa-text"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
