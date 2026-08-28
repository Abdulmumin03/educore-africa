"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { Plus, ShieldCheck, ShieldOff } from "lucide-react"

import { CONSOLE_ROLE_LABEL } from "@/lib/console-roles"
import { cn } from "@/lib/utils"

export type StaffRow = {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  totpEnabled: boolean
  allowedIPs: string[]
  lastLoginAt: string | null
  createdAt: string
  liveSessions: number
}


export function StaffManager({
  initialRows,
  roles,
  canManage,
  currentUserId,
}: {
  initialRows: StaffRow[]
  roles: string[]
  canManage: boolean
  currentUserId: string
}) {
  const router = useRouter()
  const [rows, setRows] = React.useState(initialRows)
  const [creating, setCreating] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  const [draft, setDraft] = React.useState({
    name: "",
    email: "",
    password: "",
    role: "SUPPORT_ADMIN",
    allowedIPs: "",
  })

  React.useEffect(() => setRows(initialRows), [initialRows])

  async function reload() {
    const response = await fetch("/api/internal-users")
    if (!response.ok) return
    const data = (await response.json()) as { users: StaffRow[] }
    setRows(data.users)
    router.refresh()
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusyId("new")
    setError(null)
    setNotice(null)
    try {
      const response = await fetch("/api/internal-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          allowedIPs: draft.allowedIPs
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
        }),
      })
      const data = (await response.json()) as { error?: string; notice?: string }
      if (!response.ok) throw new Error(data.error ?? "Could not create the account.")
      setNotice(data.notice ?? "Account created.")
      setDraft({ name: "", email: "", password: "", role: "SUPPORT_ADMIN", allowedIPs: "" })
      setCreating(false)
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusyId(null)
    }
  }

  async function update(id: string, patch: Record<string, unknown>) {
    setBusyId(id)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/internal-users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const data = (await response.json()) as { error?: string; sessionsRevoked?: number }
      if (!response.ok) throw new Error(data.error ?? "Could not update the account.")
      if (data.sessionsRevoked) {
        setNotice(`${data.sessionsRevoked} live session(s) revoked.`)
      }
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-body text-sa-red">{error}</p>}
      {notice && <p className="text-body text-sa-green">{notice}</p>}

      {canManage && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setCreating((open) => !open)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {creating ? "Cancel" : "New staff account"}
          </button>
        </div>
      )}

      {creating && canManage && (
        <form
          onSubmit={create}
          className="grid gap-3 rounded-lg border border-sa-border bg-sa-surface p-4 sm:grid-cols-2"
        >
          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Name
            <input
              required
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Email
            <input
              required
              type="email"
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Role
            <select
              value={draft.role}
              onChange={(event) => setDraft({ ...draft, role: event.target.value })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2 text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {CONSOLE_ROLE_LABEL[role as keyof typeof CONSOLE_ROLE_LABEL] ?? role}
                </option>
              ))}
            </select>
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim">
            Initial password (min 12)
            <input
              required
              minLength={12}
              type="text"
              value={draft.password}
              onChange={(event) => setDraft({ ...draft, password: event.target.value })}
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 font-mono text-body normal-case tracking-normal text-sa-text focus:border-sa-blue focus:outline-none"
            />
          </label>

          <label className="text-caption uppercase tracking-wide text-sa-dim sm:col-span-2">
            Allowed IPs (comma separated, blank = fall back to ALLOWED_IPS)
            <input
              value={draft.allowedIPs}
              onChange={(event) => setDraft({ ...draft, allowedIPs: event.target.value })}
              placeholder="102.89.0.0/16, 41.58.12.9"
              className="mt-1 h-8 w-full rounded-md border border-sa-border bg-sa-raised px-2.5 font-mono text-body normal-case tracking-normal text-sa-text placeholder:text-sa-disabled focus:border-sa-blue focus:outline-none"
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busyId === "new"}
              className="h-8 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:opacity-50"
            >
              {busyId === "new" ? "Creating…" : "Create account"}
            </button>
            <p className="mt-1.5 text-caption text-sa-dim">
              The account must enrol TOTP at first sign-in before the console opens to it.
            </p>
          </div>
        </form>
      )}

      <section className="rounded-lg border border-sa-border bg-sa-surface">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Staff
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Role
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  MFA
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  IP allowlist
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Sessions
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Last login
                </th>
                {canManage && (
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-sa-border/60 last:border-0",
                    !row.isActive && "opacity-60",
                  )}
                >
                  <td className="px-4 py-2">
                    <p className="text-sa-text">
                      {row.name}
                      {row.id === currentUserId && (
                        <span className="ml-2 text-caption text-sa-dim">(you)</span>
                      )}
                    </p>
                    <p className="font-mono text-caption text-sa-dim">{row.email}</p>
                  </td>
                  <td className="px-3 py-2">
                    {canManage && row.id !== currentUserId ? (
                      <select
                        value={row.role}
                        disabled={busyId === row.id}
                        onChange={(event) => void update(row.id, { role: event.target.value })}
                        className="h-7 rounded border border-sa-border bg-sa-raised px-1.5 text-body text-sa-text focus:border-sa-blue focus:outline-none"
                      >
                        {roles.map((role) => (
                          <option key={role} value={role}>
                            {CONSOLE_ROLE_LABEL[role as keyof typeof CONSOLE_ROLE_LABEL] ?? role}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sa-muted">{CONSOLE_ROLE_LABEL[row.role as keyof typeof CONSOLE_ROLE_LABEL] ?? row.role}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.totpEnabled ? (
                      <span className="inline-flex items-center gap-1.5 text-caption text-sa-green">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Enrolled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-caption text-sa-amber">
                        <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                        Not enrolled
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-caption text-sa-dim">
                    {row.allowedIPs.length === 0 ? "env default" : row.allowedIPs.join(", ")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-sa-muted">
                    {row.liveSessions}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-caption tabular-nums text-sa-dim">
                    {row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleDateString("en-GB") : "never"}
                  </td>
                  {canManage && (
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={busyId === row.id || !row.totpEnabled}
                          onClick={() => void update(row.id, { resetTotp: true })}
                          className="h-7 rounded border border-sa-border px-2 text-caption text-sa-muted transition-colors hover:border-sa-amber hover:text-sa-amber disabled:opacity-30"
                        >
                          Reset MFA
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id || row.id === currentUserId}
                          onClick={() => void update(row.id, { isActive: !row.isActive })}
                          className={cn(
                            "h-7 rounded border px-2 text-caption transition-colors disabled:opacity-30",
                            row.isActive
                              ? "border-sa-border text-sa-muted hover:border-sa-red hover:text-sa-red"
                              : "border-sa-green/50 text-sa-green hover:bg-sa-green/10",
                          )}
                        >
                          {row.isActive ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
