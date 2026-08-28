import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { prisma } from "@/lib/db"
import { requireConsoleUser } from "@/lib/session"

export const metadata: Metadata = { title: "Profile" }
export const dynamic = "force-dynamic"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-sa-border py-2.5 last:border-b-0">
      <span className="text-body text-sa-muted">{label}</span>
      <span className="text-right text-body">{children}</span>
    </div>
  )
}

export default async function ProfilePage() {
  const user = await requireConsoleUser()

  const [account, sessions] = await Promise.all([
    prisma.superAdminUser.findUnique({
      where: { id: user.id },
      select: {
        createdAt: true,
        lastLoginAt: true,
        lastLoginIP: true,
        allowedIPs: true,
        totpEnabled: true,
      },
    }),
    prisma.superAdminSession.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastActiveAt: "desc" },
      select: { id: true, ipAddress: true, userAgent: true, lastActiveAt: true, expiresAt: true },
    }),
  ])

  return (
    <>
      <PageHeader title="Profile" description="Your console account. Only you can see this page." />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-sa-border bg-sa-surface p-4">
          <h2 className="mb-2 text-h3">Account</h2>
          <Row label="Name">{user.name}</Row>
          <Row label="Email">{user.email}</Row>
          <Row label="Role">
            <Badge variant="outline" className="capitalize">
              {user.role.replace(/_/g, " ").toLowerCase()}
            </Badge>
          </Row>
          <Row label="Two-factor">
            {account?.totpEnabled ? (
              <span className="text-sa-green">Active</span>
            ) : (
              <Link href="/console/settings/security/totp" className="text-sa-blue">
                Set up
              </Link>
            )}
          </Row>
          <Row label="Member since">
            <span className="tabular">
              {account?.createdAt.toLocaleDateString("en-NG", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </Row>
          <Row label="Last sign-in">
            <span className="tabular">
              {account?.lastLoginAt
                ? `${account.lastLoginAt.toLocaleString("en-NG")} · ${account.lastLoginIP ?? "unknown"}`
                : "—"}
            </span>
          </Row>
          <Row label="IP allowlist">
            {account?.allowedIPs.length ? (
              <span className="tabular">{account.allowedIPs.join(", ")}</span>
            ) : (
              <span className="text-sa-dim">Inherits the platform allowlist</span>
            )}
          </Row>
        </div>

        <div className="rounded-lg border border-sa-border bg-sa-surface p-4">
          <h2 className="mb-2 text-h3">Active sessions</h2>
          <p className="mb-2 text-caption text-sa-dim">
            Up to two at a time — signing in on a third device ends the least recently used one.
          </p>
          {sessions.map((session) => (
            <Row key={session.id} label={session.ipAddress}>
              <span className="block truncate text-sa-muted">
                {session.userAgent.slice(0, 48)}
              </span>
              <span className="tabular text-caption text-sa-dim">
                active {session.lastActiveAt.toLocaleTimeString("en-NG")} · expires{" "}
                {session.expiresAt.toLocaleTimeString("en-NG")}
              </span>
            </Row>
          ))}
        </div>
      </div>
    </>
  )
}
