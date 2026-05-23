import { redirect } from "next/navigation"
import dayjs from "dayjs"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { PayInvoiceClient } from "@/components/pay-invoice-client"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "Pay invoice · EduCore Africa" }

export default async function PayInvoicePage({ params }: { params: { invoiceId: string } }) {
  const session = await auth()
  if (!session?.user) {
    const callback = encodeURIComponent(`/pay/${params.invoiceId}`)
    redirect(`/auth/login?callbackUrl=${callback}`)
  }
  if (!session.user.schoolId) redirect("/dashboard")

  const invoice = await prisma.feeInvoice.findFirst({
    where: { id: params.invoiceId, schoolId: session.user.schoolId, deletedAt: null },
    include: {
      student: {
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          parents: {
            include: { parent: { include: { user: { select: { id: true } } } } },
          },
        },
      },
      term: { include: { academicYear: { select: { name: true } } } },
      school: { select: { name: true } },
      payments: { where: { deletedAt: null }, orderBy: { paidAt: "desc" }, take: 5 },
    },
  })
  if (!invoice) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Invoice not found or removed.
        </CardContent>
      </Card>
    )
  }

  const role = session.user.role
  const isPrivileged = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BURSAR"].includes(role)
  const isLinkedParent =
    role === "PARENT" && invoice.student.parents.some((p) => p.parent.user.id === session.user.id)
  const isStudentSelf = role === "STUDENT" && invoice.student.userId === session.user.id
  if (!isPrivileged && !isLinkedParent && !isStudentSelf) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          You don&apos;t have access to this invoice.
        </CardContent>
      </Card>
    )
  }

  const balance = Math.max(0, Number(invoice.amountDue) - Number(invoice.amountPaid))

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{invoice.school.name}</CardTitle>
          <CardDescription>
            {invoice.term.academicYear.name} · {invoice.term.type[0] + invoice.term.type.slice(1).toLowerCase()} term
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-4">
            <p className="text-sm font-semibold">
              {invoice.student.user.firstName} {invoice.student.user.lastName}
            </p>
            <p className="text-xs text-muted-foreground">
              Admission no.: {invoice.student.admissionNumber}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Invoice <span className="font-mono">{invoice.invoiceNo}</span> · due{" "}
              {dayjs(invoice.dueDate).format("D MMM YYYY")}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <Stat label="Total" value={`₦${Number(invoice.amountDue).toLocaleString()}`} />
            <Stat
              label="Paid"
              value={`₦${Number(invoice.amountPaid).toLocaleString()}`}
              accent="text-emerald-600"
            />
            <Stat label="Balance" value={`₦${balance.toLocaleString()}`} accent={balance > 0 ? "text-amber-600" : ""} />
          </div>

          {invoice.status === "PAID" || balance <= 0 ? (
            <Badge variant="default" className="w-full justify-center py-2 text-sm">
              Paid in full — no action needed.
            </Badge>
          ) : (
            <PayInvoiceClient
              invoiceId={invoice.id}
              balance={balance}
              defaultEmail={invoice.student.user.email}
            />
          )}

          {invoice.payments.length > 0 && (
            <div>
              <p className="mb-2 text-xs uppercase text-muted-foreground">Recent payments</p>
              <ul className="space-y-1 text-sm">
                {invoice.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                    <span className="text-xs">
                      {dayjs(p.paidAt).format("D MMM YYYY")} · {p.channel.replace("_", " ")}
                    </span>
                    <span className="font-mono font-semibold">
                      ₦{Number(p.amount).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-center">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${accent ?? ""}`}>{value}</p>
    </div>
  )
}
