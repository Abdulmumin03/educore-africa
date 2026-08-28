"use client"

import * as React from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

import { useToast } from "@/hooks/use-toast"
import { cn, formatCurrency } from "@/lib/utils"
import type { TxnRow } from "./transactions-table"

const REASONS = [
  { key: "REQUEST", label: "School requested it" },
  { key: "DUPLICATE", label: "Duplicate charge" },
  { key: "ERROR", label: "Billing error on our side" },
  { key: "GOODWILL", label: "Goodwill" },
] as const

export function RefundDialog({
  transaction,
  onClose,
  onDone,
}: {
  transaction: TxnRow
  onClose: () => void
  onDone: () => void
}) {
  const { toast } = useToast()
  const refundable = transaction.amount - transaction.refunded
  const [amount, setAmount] = React.useState(String(refundable))
  const [reason, setReason] = React.useState<(typeof REASONS)[number]["key"]>("REQUEST")
  const [note, setNote] = React.useState("")
  const [confirming, setConfirming] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const value = Number(amount) || 0
  const valid = value > 0 && value <= refundable + 0.001

  async function submit() {
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/revenue/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: transaction.id, amount: value, reason, note }),
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error ?? "The refund was refused.")
        return
      }

      toast({
        title: `Refund of ${formatCurrency(value)} approved`,
        description: payload.gatewayNote
          ? `Recorded in the ledger — ${payload.gatewayNote}.`
          : "Sent to the gateway.",
      })
      onDone()
    } catch {
      setError("Could not reach the server.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Cancel" onClick={onClose} className="absolute inset-0 bg-black/60" />

      <div className="relative w-full max-w-md rounded-lg border border-sa-border-em bg-sa-surface p-5 shadow-2xl">
        <h2 className="text-h2">{confirming ? "Confirm refund" : "Issue refund"}</h2>
        <p className="mt-0.5 text-caption text-sa-dim">
          {transaction.school} · <span className="tabular">{transaction.reference}</span>
        </p>

        {!confirming ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-md border border-sa-border bg-sa-base px-3 py-2 text-body">
              <p className="flex justify-between">
                <span className="text-sa-muted">Original charge</span>
                <span className="tabular">{formatCurrency(transaction.amount)}</span>
              </p>
              {transaction.refunded > 0 && (
                <p className="mt-0.5 flex justify-between text-caption">
                  <span className="text-sa-dim">Already refunded</span>
                  <span className="tabular text-sa-amber">{formatCurrency(transaction.refunded)}</span>
                </p>
              )}
              <p className="mt-0.5 flex justify-between text-caption">
                <span className="text-sa-dim">Still refundable</span>
                <span className="tabular text-sa-muted">{formatCurrency(refundable)}</span>
              </p>
            </div>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">
                Refund amount
              </span>
              <input
                type="number"
                min={0}
                max={refundable}
                step={100}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                autoFocus
                className="mt-1 h-9 w-full rounded-md border border-sa-border-em bg-sa-base px-2.5 font-mono text-body text-sa-text focus:border-sa-blue focus:outline-none"
              />
              <span className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAmount(String(refundable))}
                  className="text-caption text-sa-blue hover:text-sa-blue/80"
                >
                  Full amount
                </button>
                <button
                  type="button"
                  onClick={() => setAmount(String(Math.round(refundable / 2)))}
                  className="text-caption text-sa-blue hover:text-sa-blue/80"
                >
                  Half
                </button>
              </span>
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">Reason</span>
              <select
                value={reason}
                onChange={(event) => setReason(event.target.value as typeof reason)}
                className="mt-1 h-9 w-full rounded-md border border-sa-border-em bg-sa-base px-2 text-body text-sa-text focus:border-sa-blue focus:outline-none"
              >
                {REASONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">
                Internal note
              </span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="Why is this being refunded? Only staff see this."
                className="mt-1 w-full rounded-md border border-sa-border-em bg-sa-base p-2.5 text-body text-sa-text placeholder:text-sa-dim focus:border-sa-blue focus:outline-none"
              />
            </label>

            {error && <p className="text-body text-sa-red">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 items-center rounded-md px-3 text-body text-sa-muted hover:text-sa-text"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!valid}
                onClick={() => setConfirming(true)}
                className="inline-flex h-8 items-center rounded-md bg-sa-amber px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-amber/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Review
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex gap-2.5 rounded-md border border-sa-amber/40 bg-sa-amber/10 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sa-amber" aria-hidden="true" />
              <p className="text-body text-sa-amber">
                This is recorded against your account and cannot be undone from the console.
              </p>
            </div>

            <dl className="rounded-md border border-sa-border bg-sa-base px-3 py-2.5 text-body">
              <div className="flex justify-between border-b border-sa-border py-1">
                <dt className="text-sa-muted">School</dt>
                <dd>{transaction.school}</dd>
              </div>
              <div className="flex justify-between border-b border-sa-border py-1">
                <dt className="text-sa-muted">Original amount</dt>
                <dd className="tabular">{formatCurrency(transaction.amount)}</dd>
              </div>
              <div className="flex justify-between border-b border-sa-border py-1">
                <dt className="text-sa-muted">Refund amount</dt>
                <dd className="tabular font-semibold text-sa-amber">{formatCurrency(value)}</dd>
              </div>
              <div className="flex justify-between py-1">
                <dt className="text-sa-muted">Reason</dt>
                <dd>{REASONS.find((option) => option.key === reason)?.label}</dd>
              </div>
            </dl>

            {error && <p className="text-body text-sa-red">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="inline-flex h-8 items-center rounded-md px-3 text-body text-sa-muted hover:text-sa-text"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={pending}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md bg-sa-red px-3 text-body font-semibold text-sa-base transition-colors hover:bg-sa-red/90",
                  pending && "opacity-60",
                )}
              >
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Approve refund
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
