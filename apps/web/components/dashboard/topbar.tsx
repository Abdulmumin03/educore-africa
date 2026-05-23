"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import Image from "next/image"
import { Menu, Search, LogOut, User as UserIcon, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NotificationBell } from "@/components/dashboard/notification-bell"

type Props = {
  user: {
    name?: string | null
    email: string
    image?: string | null
    role: string
  }
  school: { name: string; logoUrl: string | null } | null
  onMobileMenu: () => void
  onOpenPalette: () => void
}

export function Topbar({ user, school, onMobileMenu, onOpenPalette }: Props) {
  const router = useRouter()
  const initials = (user.name ?? user.email)
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMobileMenu}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-2 min-w-0">
        {school?.logoUrl ? (
          <Image src={school.logoUrl} alt="" width={28} height={28} className="rounded-md" />
        ) : null}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight">
            {school?.name ?? "EduCore Africa"}
          </div>
          <div className="text-[11px] text-muted-foreground leading-tight">
            {user.role.replace("_", " ")}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="ml-2 hidden flex-1 max-w-md items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted md:flex"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search students, staff, modules…</span>
        <kbd className="hidden rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium md:inline-block">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onOpenPalette}
          aria-label="Search"
        >
          <Search className="h-5 w-5" />
        </Button>

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="ml-1 flex items-center gap-2 rounded-full p-0.5 focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Account menu"
            >
              <Avatar className="h-8 w-8">
                {user.image ? <AvatarImage src={user.image} alt={user.name ?? ""} /> : null}
                <AvatarFallback>{initials || "U"}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span className="truncate font-medium">{user.name ?? user.email}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {user.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile">
                <UserIcon className="mr-2 h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.refresh()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Switch school
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
