import Link from "next/link"
import { redirect } from "next/navigation"
import dayjs from "dayjs"
import { Banknote, ListChecks, Percent, ReceiptText, Settings2, TrendingUp } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export const metadata = { title: "Finance · EduCore Africa" }

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "BURSAR"]

export default async function FinanceLandingPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!VIEW_ROLES.includes(session.user.role)) redirect("/dashboard?forbidden=1")

  const [currentTerm, invoiceTotals, recentPayments] = await Promise.all([
    prisma.term.findFirst({
      where: { isCurrent: true, academicYear: { schoolId: session.user.schoolId } },
      include: { academicYear: { select: { name: true } } },
    }),
    prisma.feeInvoice.aggregate({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      _sum: { amountDue: true, amountPaid: true },
      _count: { _all: true },
    }),
    prisma.payment.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      orderBy: { paidAt: "desc" },
      take: 5,
      include: {
        invoice: {
          include: {
            student: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    }),
  ])

  const invoiced = Number(invoiceTotals._sum.amountDue ?? 0)
  const collected = Number(invoiceTotals._sum.amountPaid ?? 0)
  const outstanding = Math.max(0, invoiced - collected)
  const rate = invoiced > 0 ? Math.round((collected / invoiced) * 100) : null

  const tiles = [
    {
      href: "/dashboard/finance/fee-structure",
      icon: Settings2,
      title: "Fee structure",
      description: "Per-term, per-class fee components with copy + adjust.",
    },
    {
      href: "/dashboard/finance/invoices",
      icon: ReceiptText,
      title: "Invoices",
      description: "Generate, view, and record payments. PDF + QR pay link.",
    },
    {
      href: "/dashboard/finance/debtors",
      icon: ListChecks,
      title: "Debtors",
      description: "Outstanding invoices, bulk reminders, AI risk prediction.",
    },
    {
      href: "/dashboard/finance/reports",
      icon: TrendingUp,
      title: "Reports",
      description: "Revenue summary, collection by channel, per-class breakdown.",
    },
    {
      href: "/dashboard/finance/discounts",
      icon: Percent,
      title: "Discounts",
      description: "Define rules (sibling, scholarship, etc) and award them to students.",
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Finance</h1>
        <p className="text-sm text-muted-foreground">
          {currentTerm
            ? `${currentTerm.academicYear.name} · ${currentTerm.type[0] + currentTerm.type.slice(1).toLowerCase()} term`
            : "No active term"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Invoiced" value={`₦${invoiced.toLocaleString()}`} />
        <Stat label="Collected" value={`₦${collected.toLocaleString()}`} accent="text-emerald-600" />
        <Stat label="Outstanding" value={`₦${outstanding.toLocaleString()}`} accent="text-amber-600" />
        <Stat
          label="Collection rate"
          value={rate === null ? "—" : `${rate}%`}
          accent={
            rate === null
              ? undefined
              : rate >= 80
                ? "text-emerald-600"
                : rate >= 50
                  ? "text-amber-600"
                  : "text-red-600"
          }
        />
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

      {recentPayments.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Banknote className="h-4 w-4 text-emerald-600" />
              Recent payments
            </div>
            <ul className="divide-y text-sm">
              {recentPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <span>
                    {p.invoice.student.user.firstName} {p.invoice.student.user.lastName}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {p.invoice.invoiceNo} · {p.channel.replace("_", " ")} ·{" "}
                      {dayjs(p.paidAt).format("D MMM HH:mm")}
                    </span>
                  </span>
                  <span className="font-mono font-semibold">
                    ₦{Number(p.amount).toLocaleString()}
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-bold tabular-nums", accent)}>{value}</p>
      </CardContent>
    </Card>
  )
}
