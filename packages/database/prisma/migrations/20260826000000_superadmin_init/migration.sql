-- SA-00: Super Admin Console — internal EduCore Africa staff tables.
--
-- These live in the same database as the school platform but are NOT
-- tenant-scoped: a super-admin reads across every school. Nothing in the
-- school-facing app (apps/web) should ever query them.

-- ─── Enums ────────────────────────────────────────────────────────
CREATE TYPE "SuperAdminRole" AS ENUM (
  'SUPER_ADMIN', 'BUSINESS_ADMIN', 'FINANCE_ADMIN', 'SALES_ADMIN',
  'SUPPORT_ADMIN', 'ANALYTICS_ADMIN', 'ENGINEERING_ADMIN'
);

CREATE TYPE "TicketCategory" AS ENUM (
  'BILLING', 'TECHNICAL', 'FEATURE_REQUEST', 'ACCOUNT', 'OTHER'
);

CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE "TicketStatus" AS ENUM (
  'OPEN', 'IN_PROGRESS', 'WAITING_ON_CLIENT', 'RESOLVED', 'CLOSED'
);

-- ─── Staff accounts ───────────────────────────────────────────────
CREATE TABLE "super_admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "SuperAdminRole" NOT NULL,
    "password_hash" TEXT NOT NULL,
    "totp_secret" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "allowed_ips" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_login_at" TIMESTAMP(3),
    "last_login_ip" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "super_admin_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "super_admin_users_email_key" ON "super_admin_users"("email");
CREATE INDEX "super_admin_users_email_idx" ON "super_admin_users"("email");

-- ─── Sessions (revocable server-side) ─────────────────────────────
CREATE TABLE "super_admin_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admin_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "super_admin_sessions_token_key" ON "super_admin_sessions"("token");
CREATE INDEX "super_admin_sessions_user_id_idx" ON "super_admin_sessions"("user_id");
CREATE INDEX "super_admin_sessions_expires_at_idx" ON "super_admin_sessions"("expires_at");

ALTER TABLE "super_admin_sessions" ADD CONSTRAINT "super_admin_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "super_admin_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Audit trail ──────────────────────────────────────────────────
CREATE TABLE "super_admin_audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "details" JSONB,
    "ip_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admin_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "super_admin_audit_logs_user_id_idx" ON "super_admin_audit_logs"("user_id");
CREATE INDEX "super_admin_audit_logs_target_type_idx" ON "super_admin_audit_logs"("target_type");
CREATE INDEX "super_admin_audit_logs_created_at_idx" ON "super_admin_audit_logs"("created_at");

ALTER TABLE "super_admin_audit_logs" ADD CONSTRAINT "super_admin_audit_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "super_admin_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Daily platform metrics ───────────────────────────────────────
CREATE TABLE "platform_metric_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_date" TIMESTAMP(3) NOT NULL,
    "total_schools" INTEGER NOT NULL,
    "active_schools" INTEGER NOT NULL,
    "total_students" INTEGER NOT NULL,
    "total_staff" INTEGER NOT NULL,
    "mrr" DECIMAL(14,2) NOT NULL,
    "new_signups" INTEGER NOT NULL,
    "churned" INTEGER NOT NULL,
    "trial_schools" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_metric_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_metric_snapshots_snapshot_date_key"
  ON "platform_metric_snapshots"("snapshot_date");
CREATE INDEX "platform_metric_snapshots_snapshot_date_idx"
  ON "platform_metric_snapshots"("snapshot_date");

-- ─── Support desk ─────────────────────────────────────────────────
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_to" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_tickets_school_id_idx" ON "support_tickets"("school_id");
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");
CREATE INDEX "support_tickets_assigned_to_idx" ON "support_tickets"("assigned_to");
CREATE INDEX "support_tickets_created_at_idx" ON "support_tickets"("created_at");

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ticket_comments" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticket_comments_ticket_id_idx" ON "ticket_comments"("ticket_id");

ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
