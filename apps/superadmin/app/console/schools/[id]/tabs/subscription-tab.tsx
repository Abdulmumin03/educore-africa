import { prisma } from "@/lib/db"
import { CYCLE_LABEL, PLAN_LABEL } from "@/lib/plans"
import type { getSchoolDetail } from "@/lib/schools"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { ChangePlanForm } from "../change-plan-form"

type School = NonNullable<Awaited<ReturnType<typeof getSchoolDetail>>>

const DATE: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }

export async function SubscriptionTab({ school }: { school: School }) {
  // EduCore does not yet invoice schools through the platform, so there is no
  // subscription-invoice table to read. What IS real is the fee money this
  // school moves through EduCore — shown here, clearly labelled as such.
  const [collected, invoices] = await Promise.all([
    prisma.payment.aggregate({
      where: { schoolId: school.id, deletedAt: null },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payment.findMany({
      where: { schoolId: school.id, deletedAt: null },
      orderBy: { paidAt: "desc" },
      take: 10,
      select: { id: true, amount: true, channel: true, paidAt: true, reference: true },
    }),
  ])

  return (
    <div className="grid gap-4 xl:grid-cols-[3fr_2fr] xl:items-start">
      <div className="space-y-4">
        <section className="rounded-lg border border-sa-border bg-sa-surface">
          <header className="flex items-start justify-between gap-3 border-b border-sa-border px-4 py-2.5">
            <div>
              <h2 className="text-h3">Fee payments processed</h2>
              <p className="text-caption text-sa-dim">
                Parents paying this school through EduCore — not EduCore&apos;s own billing
              </p>
            </div>
            <span className="tabular shrink-0 text-h3">
              {formatCurrency(Number(collected._sum.amount ?? 0))}
            </span>
          </header>

          <div className="grid grid-cols-[1fr_1.1fr_1fr_1.6fr] items-center gap-3 border-b border-sa-border bg-sa-base/40 px-4 py-2">
            {["Date", "Amount", "Channel", "Reference"].map((head, index) => (
              <span
                key={head}
                className={`text-[11px] font-semibold uppercase tracking-wider text-sa-dim${index === 1 ? " text-right" : ""}`}
              >
                {head}
              </span>
            ))}
          </div>

          {invoices.length === 0 && (
            <p className="px-4 py-10 text-center text-body text-sa-dim">
              No fee payments recorded for this school.
            </p>
          )}

          {invoices.map((payment) => (
            <div
              key={payment.id}
              className="grid grid-cols-[1fr_1.1fr_1fr_1.6fr] items-center gap-3 border-b border-sa-border px-4 py-2 last:border-b-0"
            >
              <span className="tabular text-sa-muted">
                {payment.paidAt.toLocaleDateString("en-GB", DATE)}
              </span>
              <span className="tabular text-right">{formatCurrency(Number(payment.amount))}</span>
              <span className="text-sa-muted">{payment.channel.replace(/_/g, " ").toLowerCase()}</span>
              <span className="truncate font-mono text-caption text-sa-dim">{payment.reference}</span>
            </div>
          ))}

          <p className="px-4 py-2.5 text-caption text-sa-dim">
            {formatNumber(collected._count._all)} payment
            {collected._count._all === 1 ? "" : "s"} on record.
          </p>
        </section>

        <section className="rounded-lg border border-sa-amber/30 bg-sa-amber/5 px-4 py-3">
          <h2 className="text-h3 text-sa-amber">EduCore invoicing is not modelled yet</h2>
          <p className="mt-1 text-body text-sa-muted">
            The commercial layer records what a school is <em>on</em> — plan, price, cycle, renewal
            date — but not the invoices EduCore raises against it. Until there is a
            subscription-invoice table there is no charge history to show, and inventing one from
            the fee-payment rows above would be the wrong data under the right heading.
          </p>
        </section>
      </div>

      <div className="space-y-4">
        <section className="rounded-lg border border-sa-border bg-sa-surface">
          <header className="border-b border-sa-border px-4 py-2.5">
            <h2 className="text-h3">Current plan</h2>
            {school.subscription && (
              <p className="text-caption text-sa-dim">
                Started{" "}
                <span className="tabular">
                  {school.subscription.startedAt.toLocaleDateString("en-GB", DATE)}
                </span>
                {school.subscription.trialEndsAt && (
                  <>
                    {" · trial ends "}
                    <span className="tabular">
                      {school.subscription.trialEndsAt.toLocaleDateString("en-GB", DATE)}
                    </span>
                  </>
                )}
              </p>
            )}
          </header>
          <div className="px-4 py-3">
            {school.subscription ? (
              <dl className="space-y-1.5 text-body">
                <div className="flex justify-between">
                  <dt className="text-sa-muted">Plan</dt>
                  <dd>{PLAN_LABEL[school.subscription.plan]}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sa-muted">Cycle</dt>
                  <dd>{CYCLE_LABEL[school.subscription.cycle]}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sa-muted">Amount</dt>
                  <dd className="tabular">{formatCurrency(Number(school.subscription.amount))}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sa-muted">Monthly equivalent</dt>
                  <dd className="tabular">{formatCurrency(school.mrr)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sa-muted">Seats</dt>
                  <dd className="tabular">
                    {school.subscription.seats ? formatNumber(school.subscription.seats) : "Uncapped"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-body text-sa-dim">No subscription yet — create one below.</p>
            )}
          </div>
        </section>

        <ChangePlanForm
          schoolId={school.id}
          current={
            school.subscription
              ? {
                  plan: school.subscription.plan,
                  cycle: school.subscription.cycle,
                  amount: Number(school.subscription.amount),
                  promoCode: school.subscription.promoCode,
                  promoPercent: school.subscription.promoPercent,
                }
              : null
          }
        />
      </div>
    </div>
  )
}
