"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  KeyRound,
  Loader2,
  Pause,
  Play,
  Search,
  UserPlus,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ROLES } from "@/lib/permissions"

type UserRow = {
  id: string
  email: string
  name: string
  role: string
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

type ListResponse = { total: number; page: number; limit: number; items: UserRow[] }

const ANY = "ANY"

export function UsersManager() {
  const qc = useQueryClient()
  const [q, setQ] = useState("")
  const [role, setRole] = useState<string>(ANY)
  const [status, setStatus] = useState<"all" | "active" | "suspended">("all")
  const [page, setPage] = useState(1)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [credentials, setCredentials] = useState<{
    email: string
    tempPassword: string
    label: string
  } | null>(null)

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (q.trim()) p.set("q", q.trim())
    if (role !== ANY) p.set("role", role)
    if (status !== "all") p.set("status", status)
    p.set("page", String(page))
    return p.toString()
  }, [q, role, status, page])

  const list = useQuery<ListResponse>({
    queryKey: ["users", query],
    queryFn: async () => {
      const res = await fetch(`/api/users?${query}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const action = useMutation({
    mutationFn: async (input: {
      id: string
      body: Record<string, unknown>
    }) => {
      const res = await fetch(`/api/users/${input.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.body),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string; tempPassword?: string }
      if (!res.ok) throw new Error(b.error ?? "Failed")
      return b
    },
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ["users"] })
      if (b.tempPassword) {
        toast.success("Password reset")
      } else {
        toast.success("Updated")
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const items = list.data?.items ?? []
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.limit)) : 1

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User accounts</h1>
          <p className="text-sm text-muted-foreground">
            Invite staff and parents, change roles, suspend or reset accounts.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" />
            Import CSV
          </Button>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            Invite user
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid items-end gap-3 p-3 sm:grid-cols-[1fr_180px_160px]">
          <div className="space-y-1.5">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setPage(1)
                }}
                placeholder="Name or email…"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => {
                setRole(v)
                setPage(1)
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All</SelectItem>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as typeof status)
                setPage(1)
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {list.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <UserPlus className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No users match these filters.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="hidden grid-cols-[2fr_2fr_1.2fr_1.2fr_1fr_220px] gap-2 border-b px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground sm:grid">
                <div>Name</div>
                <div>Email</div>
                <div>Role</div>
                <div>Last login</div>
                <div>Status</div>
                <div className="text-right">Actions</div>
              </div>
              <ul className="divide-y">
                {items.map((u) => (
                  <li
                    key={u.id}
                    className="grid items-center gap-2 p-3 text-sm sm:grid-cols-[2fr_2fr_1.2fr_1.2fr_1fr_220px]"
                  >
                    <div className="truncate font-medium">{u.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                    <div>
                      <Badge variant="secondary" className="text-[10px]">
                        {u.role.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {u.lastLoginAt
                        ? dayjs(u.lastLoginAt).format("D MMM YYYY")
                        : "Never"}
                    </div>
                    <div>
                      {u.isActive ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-700">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          Suspended
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={action.isPending}
                        onClick={() =>
                          action.mutate({
                            id: u.id,
                            body: { action: u.isActive ? "suspend" : "reactivate" },
                          })
                        }
                      >
                        {u.isActive ? (
                          <Pause className="mr-1 h-3.5 w-3.5" />
                        ) : (
                          <Play className="mr-1 h-3.5 w-3.5" />
                        )}
                        {u.isActive ? "Suspend" : "Reactivate"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={action.isPending}
                        onClick={async () => {
                          if (typeof window !== "undefined" && !window.confirm(`Reset password for ${u.email}?`)) return
                          const r = await fetch(`/api/users/${u.id}`, {
                            method: "PATCH",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ action: "reset-password" }),
                          })
                          const b = (await r.json().catch(() => ({}))) as { tempPassword?: string; error?: string }
                          if (!r.ok || !b.tempPassword) {
                            toast.error(b.error ?? "Failed")
                            return
                          }
                          setCredentials({
                            email: u.email,
                            tempPassword: b.tempPassword,
                            label: "Reset password",
                          })
                          qc.invalidateQueries({ queryKey: ["users"] })
                        }}
                      >
                        <KeyRound className="mr-1 h-3.5 w-3.5" />
                        Reset
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {list.data && list.data.total > list.data.limit && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {(page - 1) * list.data.limit + 1}–
                {Math.min(page * list.data.limit, list.data.total)} of{" "}
                {list.data.total.toLocaleString()}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {inviteOpen && (
        <InviteDialog
          onClose={() => setInviteOpen(false)}
          onInvited={(c) => {
            setInviteOpen(false)
            setCredentials({ ...c, label: "New user invited" })
            qc.invalidateQueries({ queryKey: ["users"] })
          }}
        />
      )}
      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false)
            qc.invalidateQueries({ queryKey: ["users"] })
          }}
        />
      )}
      <CredentialsDialog
        creds={credentials}
        onClose={() => setCredentials(null)}
      />
    </div>
  )
}

function InviteDialog({
  onClose,
  onInvited,
}: {
  onClose: () => void
  onInvited: (creds: { email: string; tempPassword: string }) => void
}) {
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [role, setRole] = useState("TEACHER")

  const invite = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || undefined,
          role,
        }),
      })
      const b = (await res.json().catch(() => ({}))) as {
        error?: string
        tempPassword?: string
      }
      if (!res.ok || !b.tempPassword) throw new Error(b.error ?? "Failed")
      return b.tempPassword
    },
    onSuccess: (tempPassword) => {
      onInvited({ email, tempPassword })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>
            Creates the account with a one-time password you&apos;ll share with them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={80} />
            </Field>
            <Field label="Last name">
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={80} />
            </Field>
          </div>
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={160}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone (optional)">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
            </Field>
            <Field label="Role">
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[
                    "SCHOOL_ADMIN",
                    "PRINCIPAL",
                    "TEACHER",
                    "BURSAR",
                    "COUNSELOR",
                    "LIBRARIAN",
                    "HOSTEL_MASTER",
                    "DRIVER",
                    "PARENT",
                  ].map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={invite.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => invite.mutate()}
            disabled={
              !email.trim() ||
              firstName.trim().length < 1 ||
              lastName.trim().length < 1 ||
              invite.isPending
            }
          >
            {invite.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportDialog({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: () => void
}) {
  const [csv, setCsv] = useState("")
  const [report, setReport] = useState<{
    added: number
    skipped: number
    failed: number
    results: Array<
      | { ok: true; row: number; email: string; tempPassword: string }
      | { ok: false; row: number; email: string; error: string }
    >
  } | null>(null)

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/users/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((b as { error?: string }).error ?? "Failed")
      return b as typeof report
    },
    onSuccess: (r) => {
      setReport(r)
      if (r && r.added > 0) {
        toast.success(`Created ${r.added} user${r.added === 1 ? "" : "s"}`)
      } else {
        toast.warning("No users created")
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk import users</DialogTitle>
          <DialogDescription>
            Staff and parents only — students use the new-student wizard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Button asChild variant="outline" size="sm">
            <a href="/api/users/import/template" download>
              Download CSV template
            </a>
          </Button>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              if (f.size > 2 * 1024 * 1024) {
                toast.error("Max 2 MB")
                return
              }
              setCsv(await f.text())
              setReport(null)
              e.target.value = ""
            }}
          />
          {report && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-700">Added: {report.added}</span>
                <span className="text-amber-700">Skipped: {report.skipped}</span>
                <span className="text-destructive">Failed: {report.failed}</span>
              </div>
              <ul className="max-h-56 space-y-0.5 overflow-y-auto text-[11px]">
                {report.results.map((r, i) => (
                  <li key={i} className="font-mono">
                    Row {r.row}: <span className="font-medium">{r.email}</span> —{" "}
                    {r.ok ? (
                      <span className="text-emerald-700">
                        temp password: <span className="rounded bg-emerald-100 px-1">{r.tempPassword}</span>
                      </span>
                    ) : (
                      <span className="text-destructive">{r.error}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          {report ? (
            <Button onClick={onDone}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} disabled={submit.isPending}>
                Cancel
              </Button>
              <Button onClick={() => submit.mutate()} disabled={!csv || submit.isPending}>
                {submit.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Import
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CredentialsDialog({
  creds,
  onClose,
}: {
  creds: { email: string; tempPassword: string; label: string } | null
  onClose: () => void
}) {
  if (!creds) return null
  async function copy() {
    await navigator.clipboard.writeText(`${creds!.email}\n${creds!.tempPassword}`)
    toast.success("Copied")
  }
  return (
    <Dialog open={!!creds} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{creds.label}</DialogTitle>
          <DialogDescription>
            Share this one-time password with the user. They&apos;ll change it on first login.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-md border bg-muted/30 p-3 font-mono text-sm">
          <div>
            <span className="text-[11px] uppercase text-muted-foreground">Email</span>
            <p>{creds.email}</p>
          </div>
          <div>
            <span className="text-[11px] uppercase text-muted-foreground">Temporary password</span>
            <p className="text-lg font-bold tracking-wider">{creds.tempPassword}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={copy}>
            <Copy className="mr-1.5 h-4 w-4" />
            Copy
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
