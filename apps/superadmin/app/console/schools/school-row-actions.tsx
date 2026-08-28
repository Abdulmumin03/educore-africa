"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Ban, Download, Eye, MoreHorizontal, Pencil, ScanEye } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import type { SchoolRow } from "@/lib/schools"

export function SchoolRowActions({ school }: { school: SchoolRow }) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, setPending] = React.useState(false)

  async function impersonate() {
    setPending(true)
    try {
      const response = await fetch(`/api/schools/${school.id}/impersonate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Opened from the school directory" }),
      })
      const payload = await response.json()

      if (!response.ok) {
        toast({
          variant: "destructive",
          title: "Could not start the session",
          description: payload.error ?? "Try again from the school profile.",
        })
        return
      }

      window.open(payload.redirectUrl, "_blank", "noopener,noreferrer")
      toast({
        title: `Viewing ${school.name} as support`,
        description: "Read-only, expires in 1 hour. The session is recorded in the audit log.",
      })
    } catch {
      toast({ variant: "destructive", title: "Could not reach the server" })
    } finally {
      setPending(false)
    }
  }

  async function suspend() {
    setPending(true)
    try {
      const response = await fetch(`/api/schools/${school.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SUSPENDED", reason: "Suspended from the directory" }),
      })
      const payload = await response.json()

      if (!response.ok) {
        toast({
          variant: "destructive",
          title: "Could not suspend",
          description: payload.error ?? "You may not have permission.",
        })
        return
      }

      toast({ title: `${school.name} suspended` })
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
          aria-label={`Actions for ${school.name}`}
          disabled={pending}
          className="flex h-6 w-6 items-center justify-center rounded text-sa-disabled transition-colors hover:bg-sa-overlay hover:text-sa-text group-hover:text-sa-muted"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link href={`/console/schools/${school.id}`} className="cursor-pointer">
            <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
            View profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/console/schools/${school.id}?tab=subscription`} className="cursor-pointer">
            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
            Edit plan
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`/api/schools/export?search=${encodeURIComponent(school.slug)}`} className="cursor-pointer">
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Export row
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void impersonate()} className="cursor-pointer">
          <ScanEye className="mr-2 h-4 w-4" aria-hidden="true" />
          View as admin
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void suspend()}
          disabled={school.status === "SUSPENDED"}
          className="cursor-pointer text-sa-red focus:text-sa-red"
        >
          <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
          Suspend
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
