"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import type { SubscriptionStatus } from "@prisma/client"
import { Ban, CircleCheckBig, Download, MoreHorizontal, XCircle } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"

export function SchoolActions({
  schoolId,
  schoolName,
  status,
}: {
  schoolId: string
  schoolName: string
  status: SubscriptionStatus | null
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, setPending] = React.useState(false)

  async function setStatus(next: SubscriptionStatus, verb: string) {
    setPending(true)
    try {
      const response = await fetch(`/api/schools/${schoolId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, reason: `${verb} from the school profile` }),
      })
      const payload = await response.json()

      if (!response.ok) {
        toast({
          variant: "destructive",
          title: `Could not ${verb.toLowerCase()}`,
          description: payload.error ?? "You may not have permission.",
        })
        return
      }

      toast({ title: `${schoolName} — ${verb.toLowerCase()}d` })
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Could not reach the server" })
    } finally {
      setPending(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More actions"
          disabled={pending}
          className="inline-flex h-8 w-9 items-center justify-center rounded-md border border-sa-border-em bg-sa-surface transition-colors hover:bg-sa-raised disabled:opacity-60"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        {status !== "ACTIVE" && (
          <DropdownMenuItem
            onSelect={() => void setStatus("ACTIVE", "Activate")}
            className="cursor-pointer text-sa-green focus:text-sa-green"
          >
            <CircleCheckBig className="mr-2 h-4 w-4" aria-hidden="true" />
            Activate
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => void setStatus("SUSPENDED", "Suspend")}
          disabled={status === "SUSPENDED"}
          className="cursor-pointer text-sa-amber focus:text-sa-amber"
        >
          <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
          Suspend
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void setStatus("CHURNED", "Deactivate")}
          disabled={status === "CHURNED"}
          className="cursor-pointer text-sa-red focus:text-sa-red"
        >
          <XCircle className="mr-2 h-4 w-4" aria-hidden="true" />
          Deactivate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={`/api/schools/export?search=${schoolId}`} className="cursor-pointer">
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Export data
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
