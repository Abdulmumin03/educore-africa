-- SA-06: subscription billing — what EduCore charges a school and what came
-- back. Reuses PaymentChannel for the gateway so there is one vocabulary for
-- "how money moved" across both billing directions.

CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');
CREATE TYPE "RefundReason" AS ENUM ('REQUEST', 'DUPLICATE', 'ERROR', 'GOODWILL');
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED');
CREATE TYPE "RevisionKind" AS ENUM ('NEW', 'UPGRADE', 'DOWNGRADE', 'PRICE_CHANGE', 'CYCLE_CHANGE', 'CHURN', 'REACTIVATION');

CREATE TABLE "subscription_transactions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "gateway" "PaymentChannel" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT NOT NULL,
    "gateway_ref" TEXT,
    "failure_reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "last_attempt_at" TIMESTAMP(3),
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "reminders_sent" INTEGER NOT NULL DEFAULT 0,
    "last_reminder_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_transactions_reference_key" ON "subscription_transactions"("reference");
CREATE INDEX "subscription_transactions_school_id_created_at_idx" ON "subscription_transactions"("school_id", "created_at");
CREATE INDEX "subscription_transactions_status_idx" ON "subscription_transactions"("status");
CREATE INDEX "subscription_transactions_gateway_idx" ON "subscription_transactions"("gateway");
CREATE INDEX "subscription_transactions_due_date_idx" ON "subscription_transactions"("due_date");

ALTER TABLE "subscription_transactions" ADD CONSTRAINT "subscription_transactions_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_transactions" ADD CONSTRAINT "subscription_transactions_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "school_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "subscription_refunds" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "original_amount" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "requested_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "gateway_ref" TEXT,
    "gateway_sent" BOOLEAN NOT NULL DEFAULT false,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_refunds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_refunds_school_id_idx" ON "subscription_refunds"("school_id");
CREATE INDEX "subscription_refunds_status_idx" ON "subscription_refunds"("status");
CREATE INDEX "subscription_refunds_created_at_idx" ON "subscription_refunds"("created_at");

ALTER TABLE "subscription_refunds" ADD CONSTRAINT "subscription_refunds_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "subscription_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_refunds" ADD CONSTRAINT "subscription_refunds_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Append-only history of commercial terms. Net revenue retention cannot
-- separate expansion from contraction without it: the current amount says
-- nothing about what the school used to pay.
CREATE TABLE "subscription_revisions" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "kind" "RevisionKind" NOT NULL,
    "fromPlan" "SchoolPlan",
    "toPlan" "SchoolPlan",
    "from_monthly" DECIMAL(12,2),
    "to_monthly" DECIMAL(12,2) NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL,
    "actor_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_revisions_subscription_id_effective_at_idx" ON "subscription_revisions"("subscription_id", "effective_at");
CREATE INDEX "subscription_revisions_school_id_idx" ON "subscription_revisions"("school_id");
CREATE INDEX "subscription_revisions_effective_at_idx" ON "subscription_revisions"("effective_at");

ALTER TABLE "subscription_revisions" ADD CONSTRAINT "subscription_revisions_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "school_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_revisions" ADD CONSTRAINT "subscription_revisions_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
