"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, CheckCircle2, Loader2, MoreHorizontal, RotateCw } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PlanBadge } from "@/components/shared/plan-badge"
import { useToast } from "@/hooks/use-toast"
import type { PlanKey } from "@/lib/plans"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"

export type FailedRow = {
  id: string
  schoolId: string
  school: string
  schoolSlug: string
  plan: PlanKey | null
  amount: number
  gateway: string
  failureReason: string
  attempts: number
  lastAttemptAt: string | null
  daysOverdue: number
  remindersSent: number
  lastReminderAt: string | null
}

export function FailedPaymentsTable({ items, canAct }: { items: FailedRow[]; canAct: boolean }) {
  const router = useRouter()
  const { toast } = useToast()
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)

  const allSelected = items.length > 0 && selected.size === items.length

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function call(id: string, action: "send-reminder" | "retry" | "resolve") {
    const response = await fetch(`/api/revenue/failed-payments/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const payload = await response.json().catch(() => ({}))
    return { ok: response.ok, payload }
  }

  async function single(id: string, action: "send-reminder" | "retry" | "resolve", label: string) {
    setBusy(true)
    try {
      const { ok, payload } = await call(id, action)
      if (!ok) {
        toast({ variant: "destructive", title: `Could not ${label}`, description: payload.error })
        return
      }
      toast({
        title: `${label} done`,
        description: payload.note ?? undefined,
      })
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Could not reach the server" })
    } finally {
      setBusy(false)
    }
  }

  async function bulkRemind() {
    setBusy(true)
    const ids = [...selected]
    let sent = 0
    let failed = 0
    for (const id of ids) {
      try {
        const { ok } = await call(id, "send-reminder")
        if (ok) sent += 1
        else failed += 1
      } catch {
        failed += 1
      }
    }
    setBusy(false)
    setSelected(new Set())
    toast({
      title: `${sent} reminder${sent === 1 ? "" : "s"} queued`,
      description:
        failed > 0
          ? `${failed} could not be sent. In-app only — SMS and email dispatch belongs to the school app worker.`
          : "In-app notices created. SMS and email dispatch belongs to the school app worker.",
      variant: failed > 0 ? "destructive" : undefined,
    })
    router.refresh()
  }

  return (
    <>
      {canAct && selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-sa-blue/40 bg-sa-blue/10 px-3 py-2">
          <span className="text-body">
            <span className="tabular font-semibold">{selected.size}</span> selected ·{" "}
            <span className="tabular">
              {formatCurrency(
                items.filter((item) => selected.has(item.id)).reduce((sum, item) => sum + item.amount, 0),
              )}
            </span>{" "}
            outstanding
          </span>
          <button
            type="button"
            onClick={() => void bulkRemind()}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sa-blue px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-blue/90 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Send payment reminder
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-caption text-sa-muted hover:text-sa-text"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-sa-border bg-sa-surface">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-sa-border bg-sa-base/40">
                <th scope="col" className="h-8 w-10 px-3">
                  {canAct && (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() =>
                        setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))
                      }
                      aria-label="Select all"
                      className="h-3.5 w-3.5 accent-sa-blue"
                    />
                  )}
                </th>
                {["School", "Plan", "Amount", "Gateway", "Fail reason", "Attempts", "Last attempt", "Days overdue"].map(
                  (head, index) => (
                    <th
                      key={head}
                      scope="col"
                      className={cn(
                        "h-8 px-3 text-left text-[11px] font-semibold uppercase tracking-wider text-sa-dim",
                        (index === 2 || index === 5 || index === 7) && "text-right",
                      )}
                    >
                      {head}
                    </th>
                  ),
                )}
                <th scope="col" className="h-8 w-10 px-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="group border-b border-sa-border last:border-b-0 hover:bg-sa-raised">
                  <td className="h-9 px-3">
                    {canAct && (
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggle(item.id)}
                        aria-label={`Select ${item.school}`}
                        className="h-3.5 w-3.5 accent-sa-blue"
                      />
                    )}
                  </td>
                  <td className="h-9 max-w-[200px] px-3">
                    <Link
                      href={`/console/schools/${item.schoolId}`}
                      className="block truncate hover:text-sa-blue"
                    >
                      {item.school}
                    </Link>
                  </td>
                  <td className="h-9 px-3">
                    {item.plan ? <PlanBadge plan={item.plan} /> : <span className="text-sa-disabled">—</span>}
                  </td>
                  <td className="tabular h-9 px-3 text-right">{formatCurrency(item.amount)}</td>
                  <td className="h-9 px-3 capitalize text-sa-muted">
                    {item.gateway.replace(/_/g, " ").toLowerCase()}
                  </td>
                  <td className="h-9 max-w-[220px] truncate px-3 text-sa-red">{item.failureReason}</td>
                  <td className="tabular h-9 px-3 text-right text-sa-muted">{item.attempts}</td>
                  <td className="tabular h-9 px-3 text-sa-muted">
                    {item.lastAttemptAt
                      ? new Date(item.lastAttemptAt).toLocaleDateString("en-GB")
                      : "—"}
                  </td>
                  <td
                    className={cn(
                      "tabular h-9 px-3 text-right font-medium",
                      item.daysOverdue >= 30
                        ? "text-sa-red"
                        : item.daysOverdue >= 14
                          ? "text-sa-amber"
                          : "text-sa-muted",
                    )}
                  >
                    {formatNumber(item.daysOverdue)}
                    {item.remindersSent > 0 && (
                      <span className="ml-1 text-caption text-sa-dim">
                        · {item.remindersSent} chased
                      </span>
                    )}
                  </td>
                  <td className="h-9 px-3 text-right">
                    {canAct && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Actions for ${item.school}`}
                            disabled={busy}
                            className="flex h-6 w-6 items-center justify-center rounded text-sa-disabled transition-colors hover:bg-sa-overlay hover:text-sa-text group-hover:text-sa-muted"
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem
                            onSelect={() => void single(item.id, "send-reminder", "Send reminder")}
                            className="cursor-pointer"
                          >
                            <Bell className="mr-2 h-4 w-4" aria-hidden="true" />
                            Send reminder
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => void single(item.id, "retry", "Retry payment")}
                            className="cursor-pointer"
                          >
                            <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
                            Retry payment
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => void single(item.id, "resolve", "Mark resolved")}
                            className="cursor-pointer"
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                            Mark as resolved
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link href={`/console/schools/${item.schoolId}`} className="cursor-pointer">
                              View school
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/console/revenue/transactions?search=${encodeURIComponent(item.school)}`}
                              className="cursor-pointer"
                            >
                              Issue manual invoice
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}

              {items.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-14 text-center">
                    <CheckCircle2 className="mx-auto h-6 w-6 text-sa-green" aria-hidden="true" />
                    <p className="mt-2 text-body font-medium text-sa-muted">Nothing outstanding</p>
                    <p className="mt-1 text-caption text-sa-dim">
                      Every subscription charge has settled or been resolved.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
