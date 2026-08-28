import { prisma } from "@/lib/db"
import { formatCurrency, formatNumber } from "@/lib/utils"

export async function FinancialsTab({ schoolId }: { schoolId: string }) {
  const [invoices, payments, byStatus] = await Promise.all([
    prisma.feeInvoice.aggregate({
      where: { schoolId, deletedAt: null },
      _sum: { amountDue: true, amountPaid: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: { schoolId, deletedAt: null },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.feeInvoice.groupBy({
      by: ["status"],
      where: { schoolId, deletedAt: null },
      _count: { _all: true },
      _sum: { amountDue: true },
    }),
  ])

  const billed = Number(invoices._sum.amountDue ?? 0)
  const collected = Number(invoices._sum.amountPaid ?? 0)
  const outstanding = Math.max(0, billed - collected)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Billed", value: formatCurrency(billed), hint: `${formatNumber(invoices._count._all)} invoices` },
          { label: "Collected", value: formatCurrency(collected), hint: `${formatNumber(payments._count._all)} payments` },
          { label: "Outstanding", value: formatCurrency(outstanding), hint: billed > 0 ? `${((outstanding / billed) * 100).toFixed(1)}% of billings` : "Nothing billed" },
          { label: "Collection rate", value: billed > 0 ? `${((collected / billed) * 100).toFixed(1)}%` : "—", hint: "Paid over billed" },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-sa-border bg-sa-surface p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">{card.label}</p>
            <p className="tabular mt-1.5 text-[22px] font-bold leading-none">{card.value}</p>
            <p className="mt-1.5 text-caption text-sa-dim">{card.hint}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-sa-border bg-sa-surface">
        <header className="border-b border-sa-border px-4 py-2.5">
          <h2 className="text-h3">Invoices by status</h2>
          <p className="text-caption text-sa-dim">
            The school&apos;s own fee billing — parents paying the school, not EduCore&apos;s
            subscription revenue.
          </p>
        </header>

        {byStatus.length === 0 && (
          <p className="px-4 py-12 text-center text-body text-sa-dim">No invoices raised yet.</p>
        )}

        {byStatus.map((row) => (
          <div
            key={row.status}
            className="flex items-center justify-between gap-4 border-b border-sa-border px-4 py-2.5 last:border-b-0"
          >
            <span className="capitalize">{row.status.replace(/_/g, " ").toLowerCase()}</span>
            <span className="tabular text-sa-muted">{formatNumber(row._count._all)} invoices</span>
            <span className="tabular">{formatCurrency(Number(row._sum.amountDue ?? 0))}</span>
          </div>
        ))}
      </section>
    </div>
  )
}
