-- SA-05: EduCore's own commercial layer.
--
-- Distinct from the school's fee billing (fee_invoices / payments): these
-- tables describe what a SCHOOL pays EduCore. Only the Super Admin Console
-- reads them.

CREATE TYPE "SchoolPlan" AS ENUM ('STARTER', 'GROWTH', 'PROFESSIONAL', 'ENTERPRISE', 'GOVERNMENT');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CHURNED');
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'TERMLY', 'ANNUAL');
CREATE TYPE "CrmNoteCategory" AS ENUM ('SALES', 'SUPPORT', 'CALL', 'ONBOARDING', 'GENERAL');

CREATE TABLE "school_subscriptions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "plan" "SchoolPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "cycle" "BillingCycle" NOT NULL DEFAULT 'TERMLY',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "seats" INTEGER,
    "trial_ends_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renews_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "churn_reason" TEXT,
    "promo_code" TEXT,
    "promo_percent" INTEGER,
    "payment_method" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "school_subscriptions_school_id_key" ON "school_subscriptions"("school_id");
CREATE INDEX "school_subscriptions_status_idx" ON "school_subscriptions"("status");
CREATE INDEX "school_subscriptions_plan_idx" ON "school_subscriptions"("plan");
CREATE INDEX "school_subscriptions_renews_at_idx" ON "school_subscriptions"("renews_at");
CREATE INDEX "school_subscriptions_cancelled_at_idx" ON "school_subscriptions"("cancelled_at");

ALTER TABLE "school_subscriptions" ADD CONSTRAINT "school_subscriptions_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "school_crm_notes" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "category" "CrmNoteCategory" NOT NULL DEFAULT 'GENERAL',
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_crm_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "school_crm_notes_school_id_created_at_idx" ON "school_crm_notes"("school_id", "created_at");

ALTER TABLE "school_crm_notes" ADD CONSTRAINT "school_crm_notes_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "school_usage_snapshots" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "api_calls" INTEGER NOT NULL DEFAULT 0,
    "storage_mb" INTEGER NOT NULL DEFAULT 0,
    "sms_sent" INTEGER NOT NULL DEFAULT 0,
    "logins" INTEGER NOT NULL DEFAULT 0,
    "students_added" INTEGER NOT NULL DEFAULT 0,
    "fees_processed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_usage_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "school_usage_snapshots_school_id_month_key" ON "school_usage_snapshots"("school_id", "month");
CREATE INDEX "school_usage_snapshots_month_idx" ON "school_usage_snapshots"("month");

ALTER TABLE "school_usage_snapshots" ADD CONSTRAINT "school_usage_snapshots_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "impersonation_grants" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "super_admin_user_id" TEXT NOT NULL,
    "reason" TEXT,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),

    CONSTRAINT "impersonation_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "impersonation_grants_token_hash_key" ON "impersonation_grants"("token_hash");
CREATE INDEX "impersonation_grants_school_id_idx" ON "impersonation_grants"("school_id");
CREATE INDEX "impersonation_grants_expires_at_idx" ON "impersonation_grants"("expires_at");
CREATE INDEX "impersonation_grants_super_admin_user_id_idx" ON "impersonation_grants"("super_admin_user_id");

ALTER TABLE "impersonation_grants" ADD CONSTRAINT "impersonation_grants_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
