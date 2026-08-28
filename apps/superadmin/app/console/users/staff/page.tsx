import type { Metadata } from "next"

import { PageHeader } from "@/components/shared/page-header"
import { CONSOLE_ROLES } from "@/lib/console-roles"
import { prisma } from "@/lib/db"
import { requireRole } from "@/lib/session"
import { UsersNav } from "../users-nav"
import { StaffManager, type StaffRow } from "./staff-manager"

export const metadata: Metadata = { title: "Console Staff" }
export const dynamic = "force-dynamic"


export default async function StaffPage() {
  const me = await requireRole("SUPPORT_ADMIN")

  const users = await prisma.superAdminUser.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      totpEnabled: true,
      allowedIPs: true,
      lastLoginAt: true,
      createdAt: true,
      sessions: {
        where: { revokedAt: null, absoluteExpiresAt: { gt: new Date() } },
        select: { id: true },
      },
    },
  })

  const rows: StaffRow[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    totpEnabled: user.totpEnabled,
    allowedIPs: user.allowedIPs,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    liveSessions: user.sessions.length,
  }))

  const withoutMfa = rows.filter((row) => row.isActive && !row.totpEnabled).length

  return (
    <>
      <PageHeader
        title="Console staff"
        description={
          withoutMfa > 0
            ? withoutMfa === 1
              ? "1 active account has not enrolled TOTP yet — it cannot reach the console until it does."
              : `${withoutMfa} active accounts have not enrolled TOTP yet — they cannot reach the console until they do.`
            : "Every active account has TOTP enrolled."
        }
      />

      <UsersNav />

      {/* Creating and editing staff grants access to every school's data, so
          only SUPER_ADMIN sees the controls. Everyone else gets the roster. */}
      <StaffManager
        initialRows={rows}
        roles={CONSOLE_ROLES}
        canManage={me.role === "SUPER_ADMIN"}
        currentUserId={me.id}
      />
    </>
  )
}
