import type { Metadata } from "next"
import { KeyRound, MonitorSmartphone, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/shared/page-header"
import { TotpEnrolment } from "@/components/shared/totp-enrolment"
import { remainingBackupCodes } from "@/lib/backup-codes"
import { prisma } from "@/lib/db"
import { requireConsoleUser } from "@/lib/session"

export const metadata: Metadata = { title: "Two-factor authentication" }
export const dynamic = "force-dynamic"

export default async function TotpSettingsPage() {
  const user = await requireConsoleUser()

  const [account, codesLeft, devices] = await Promise.all([
    prisma.superAdminUser.findUnique({
      where: { id: user.id },
      select: { totpEnabled: true, totpConfirmedAt: true },
    }),
    remainingBackupCodes(user.id),
    prisma.superAdminTrustedDevice.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: "desc" },
      select: { id: true, label: true, ipAddress: true, lastUsedAt: true, expiresAt: true },
    }),
  ])

  return (
    <>
      <PageHeader
        title="Two-factor authentication"
        description="Your authenticator app, backup codes and trusted devices."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card className="shadow-none">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4" />
                  Status
                </CardTitle>
                <CardDescription>
                  {account?.totpConfirmedAt
                    ? `Enrolled ${account.totpConfirmedAt.toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}`
                    : "Not enrolled yet"}
                </CardDescription>
              </div>
              <Badge variant={account?.totpEnabled ? "default" : "destructive"}>
                {account?.totpEnabled ? "Active" : "Off"}
              </Badge>
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
              <KeyRound className="h-4 w-4" />
              {codesLeft} backup code{codesLeft === 1 ? "" : "s"} remaining
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MonitorSmartphone className="h-4 w-4" />
                Trusted devices
              </CardTitle>
              <CardDescription>
                These browsers skip the code for 30 days. Re-enrolling below clears all of them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {devices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No trusted devices.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {devices.map((device) => (
                    <li key={device.id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-medium">{device.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {device.ipAddress} · last used{" "}
                          {device.lastUsedAt.toLocaleString("en-NG")}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        expires {device.expiresAt.toLocaleDateString("en-NG")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit shadow-none">
          <CardHeader>
            <CardTitle className="text-base">
              {account?.totpEnabled ? "Re-enrol" : "Set up"} authenticator
            </CardTitle>
            <CardDescription>
              {account?.totpEnabled
                ? "Replaces your current secret, issues fresh backup codes and revokes every trusted device."
                : "Scan the code, confirm, and save your backup codes."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TotpEnrolment />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
