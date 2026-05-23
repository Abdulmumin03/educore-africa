import Link from "next/link"
import { redirect } from "next/navigation"
import { BarChart3, ClipboardEdit, FileSpreadsheet, GraduationCap } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "Grades · EduCore Africa" }

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "COUNSELOR"]

export default async function GradesLandingPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!VIEW_ROLES.includes(session.user.role)) redirect("/dashboard?forbidden=1")

  const [currentTerm, recentImports] = await Promise.all([
    prisma.term.findFirst({
      where: { isCurrent: true, academicYear: { schoolId: session.user.schoolId } },
      include: { academicYear: { select: { name: true } } },
    }),
    prisma.gradeImport.findMany({
      where: { schoolId: session.user.schoolId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }).catch(() => []),
  ])

  const tiles = [
    {
      href: "/dashboard/grades/entry",
      icon: ClipboardEdit,
      title: "Grade entry",
      description: "Spreadsheet-style with auto-save and anomaly highlighting.",
    },
    {
      href: "/dashboard/grades/import",
      icon: FileSpreadsheet,
      title: "Bulk import",
      description: "Upload a class CSV — preview valid rows before commit.",
    },
    {
      href: "/dashboard/grades/report-cards",
      icon: GraduationCap,
      title: "Report cards",
      description: "Generate, share, and print PDF report cards.",
    },
    {
      href: "/dashboard/grades/analytics",
      icon: BarChart3,
      title: "Analytics",
      description: "Subject performance, distribution, term-over-term trends.",
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Grades &amp; results</h1>
        <p className="text-sm text-muted-foreground">
          {currentTerm
            ? `${currentTerm.academicYear.name} · ${currentTerm.type[0] + currentTerm.type.slice(1).toLowerCase()} term`
            : "No active term"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(({ href, icon: Icon, title, description }) => (
          <Link
            key={href}
            href={href}
            className="rounded-lg border bg-card p-4 transition hover:border-primary/40 hover:bg-primary/5"
          >
            <Icon className="h-5 w-5 text-primary" />
            <p className="mt-3 text-sm font-semibold">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </Link>
        ))}
      </div>

      {recentImports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent imports</CardTitle>
            <CardDescription>Audit log of CSV bulk uploads.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {recentImports.map((i) => (
                <li key={i.id} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                  <span>
                    {i.rowsImported}/{i.rowsAttempted} rows ·{" "}
                    <span className="text-xs text-muted-foreground">
                      {new Date(i.createdAt).toLocaleString()}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
