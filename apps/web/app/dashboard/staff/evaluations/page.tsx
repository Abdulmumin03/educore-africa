import Link from "next/link"
import { redirect } from "next/navigation"
import dayjs from "dayjs"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const metadata = { title: "Evaluations · EduCore Africa" }

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

function badgeVariant(badge: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (badge) {
    case "OUTSTANDING":
      return "default"
    case "MEETS_EXPECTATIONS":
      return "secondary"
    case "NEEDS_IMPROVEMENT":
      return "outline"
    case "UNSATISFACTORY":
      return "destructive"
    default:
      return "outline"
  }
}

export default async function EvaluationsPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!VIEW_ROLES.includes(session.user.role)) redirect("/dashboard?forbidden=1")

  const currentTerm = await prisma.term.findFirst({
    where: { isCurrent: true, academicYear: { schoolId: session.user.schoolId } },
    include: { academicYear: { select: { name: true } } },
  })

  const [evaluations, totalStaff] = await Promise.all([
    prisma.evaluation.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 50,
      include: {
        staff: {
          select: {
            id: true,
            staffNumber: true,
            department: true,
            user: { select: { firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        term: { include: { academicYear: { select: { name: true } } } },
      },
    }),
    prisma.staff.count({
      where: { schoolId: session.user.schoolId, deletedAt: null, status: "ACTIVE" },
    }),
  ])

  const thisTermCount = currentTerm
    ? evaluations.filter((e) => e.termId === currentTerm.id).length
    : 0
  const finalized = evaluations.filter((e) => e.status === "FINAL").length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Performance evaluations</h1>
        <p className="text-sm text-muted-foreground">
          Create or finalize appraisals from any staff profile&apos;s Performance tab.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">This term</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {thisTermCount}/{totalStaff}
            </p>
            <p className="text-xs text-muted-foreground">staff evaluated</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Finalized</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">{finalized}</p>
            <p className="text-xs text-muted-foreground">total signed off</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Current term</p>
            <p className="mt-1 text-lg font-semibold">
              {currentTerm
                ? `${currentTerm.academicYear.name} · ${currentTerm.type[0] + currentTerm.type.slice(1).toLowerCase()}`
                : "No active term"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent evaluations</CardTitle>
          <CardDescription>
            Click a row to open the staff member&apos;s Performance tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {evaluations.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/30 p-8 text-center">
              <p className="text-sm font-medium">No evaluations yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Open any staff profile and use the Performance tab to create one.
              </p>
              <Button size="sm" className="mt-3" asChild>
                <Link href="/dashboard/staff">Browse staff</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Badge</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evaluations.map((e) => {
                  const initials =
                    (e.staff.user.firstName[0] ?? "") + (e.staff.user.lastName[0] ?? "")
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <Link
                          href={`/dashboard/staff/${e.staff.id}`}
                          className="flex items-center gap-2 hover:underline"
                        >
                          <Avatar className="h-7 w-7">
                            {e.staff.user.avatarUrl ? (
                              <AvatarImage src={e.staff.user.avatarUrl} alt="" />
                            ) : null}
                            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                          </Avatar>
                          <span>
                            <span className="block text-sm font-medium">
                              {e.staff.user.firstName} {e.staff.user.lastName}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {e.staff.department ?? "—"}
                            </span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">
                        {e.term.academicYear.name} ·{" "}
                        {e.term.type[0] + e.term.type.slice(1).toLowerCase()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {e.finalScore ?? "—"}/100
                      </TableCell>
                      <TableCell>
                        {e.badge ? (
                          <Badge variant={badgeVariant(e.badge)} className="text-[10px]">
                            {e.badge.replace("_", " ")}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={e.status === "FINAL" ? "default" : "secondary"} className="text-[10px]">
                          {e.status[0] + e.status.slice(1).toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {dayjs(e.finalizedAt ?? e.updatedAt).format("D MMM YYYY")}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
