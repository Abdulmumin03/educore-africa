"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { CreditCard, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function PayInvoiceClient({
  invoiceId,
  balance,
  defaultEmail,
}: {
  invoiceId: string
  balance: number
  defaultEmail: string | null
}) {
  const [amount, setAmount] = useState(String(balance))
  const [email, setEmail] = useState(defaultEmail ?? "")

  const init = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          amount: Number(amount),
          email: email || undefined,
          callbackUrl:
            typeof window !== "undefined"
              ? `${window.location.origin}/pay/${invoiceId}?paid=1`
              : undefined,
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ authorizationUrl: string }>
    },
    onSuccess: (d) => {
      window.location.href = d.authorizationUrl
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <div className="space-y-3 rounded-md border bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Amount (₦)</Label>
          <Input
            type="number"
            min={1}
            max={balance}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Email (for receipt)</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
      </div>
      <Button
        onClick={() => init.mutate()}
        disabled={init.isPending || !Number(amount) || Number(amount) > balance}
        className="w-full"
      >
        {init.isPending ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <CreditCard className="mr-1.5 h-4 w-4" />
        )}
        Pay ₦{Number(amount || 0).toLocaleString()} with Paystack
      </Button>
      <p className="text-[10px] text-muted-foreground">
        Secured by Paystack. You&apos;ll receive an SMS receipt once payment confirms.
      </p>
    </div>
  )
}
