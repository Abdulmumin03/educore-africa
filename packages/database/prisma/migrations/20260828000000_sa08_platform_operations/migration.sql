-- SA-08: platform operations — feature flags, catalogue pricing, promo codes,
-- message templates, persistent announcements, NDPR records, sales pipeline.

CREATE TYPE "FeatureFlagScope" AS ENUM ('GLOBAL', 'BY_PLAN', 'BY_SCHOOL', 'BY_STATE');
CREATE TYPE "PromoDiscountType" AS ENUM ('PERCENT', 'FIXED');
CREATE TYPE "MessageTemplateKind" AS ENUM ('EMAIL', 'SMS');
CREATE TYPE "PlatformAnnouncementType" AS ENUM ('INFO', 'WARNING', 'MAINTENANCE');
CREATE TYPE "DataRequestType" AS ENUM ('ACCESS', 'DELETION', 'PORTABILITY');
CREATE TYPE "DataRequestStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'DENIED');
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'TRIAL_STARTED', 'CONVERTED', 'LOST');
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'SIGNED_UP', 'CONVERTED', 'REWARDED');

-- ── Feature flags ───────────────────────────────────────────────────
CREATE TABLE "feature_flags" (
  "id"            TEXT NOT NULL,
  "key"           TEXT NOT NULL,
  "label"         TEXT NOT NULL,
  "description"   TEXT,
  "enabled"       BOOLEAN NOT NULL DEFAULT false,
  "default_value" BOOLEAN NOT NULL DEFAULT false,
  "rollout"       INTEGER NOT NULL DEFAULT 100,
  "scope"         "FeatureFlagScope" NOT NULL DEFAULT 'GLOBAL',
  "scope_values"  TEXT[] DEFAULT ARRAY[]::TEXT[],
  "created_by_id" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");
CREATE INDEX "feature_flags_enabled_idx" ON "feature_flags"("enabled");

-- ── Catalogue pricing ───────────────────────────────────────────────
CREATE TABLE "plan_configs" (
  "id"            TEXT NOT NULL,
  "plan"          "SchoolPlan" NOT NULL,
  "label"         TEXT NOT NULL,
  "monthly"       DECIMAL(12,2) NOT NULL,
  "termly"        DECIMAL(12,2) NOT NULL,
  "annual"        DECIMAL(12,2) NOT NULL,
  "max_students"  INTEGER,
  "storage_gb"    INTEGER NOT NULL DEFAULT 5,
  "sms_credits"   INTEGER NOT NULL DEFAULT 0,
  "modules"       TEXT[] DEFAULT ARRAY[]::TEXT[],
  "is_public"     BOOLEAN NOT NULL DEFAULT true,
  "updated_by_id" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plan_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plan_configs_plan_key" ON "plan_configs"("plan");

-- ── Promo codes ─────────────────────────────────────────────────────
CREATE TABLE "promo_codes" (
  "id"             TEXT NOT NULL,
  "code"           TEXT NOT NULL,
  "discount_type"  "PromoDiscountType" NOT NULL,
  "discount_value" DECIMAL(12,2) NOT NULL,
  "plans"          "SchoolPlan"[] DEFAULT ARRAY[]::"SchoolPlan"[],
  "expires_at"     TIMESTAMP(3),
  "max_uses"       INTEGER,
  "used_count"     INTEGER NOT NULL DEFAULT 0,
  "is_active"      BOOLEAN NOT NULL DEFAULT true,
  "note"           TEXT,
  "created_by_id"  TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");
CREATE INDEX "promo_codes_is_active_idx" ON "promo_codes"("is_active");

CREATE TABLE "promo_redemptions" (
  "id"            TEXT NOT NULL,
  "promo_code_id" TEXT NOT NULL,
  "school_id"     TEXT NOT NULL,
  "plan"          "SchoolPlan" NOT NULL,
  "amount_off"    DECIMAL(12,2) NOT NULL,
  "redeemed_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "promo_redemptions_promo_code_id_school_id_key" ON "promo_redemptions"("promo_code_id", "school_id");
CREATE INDEX "promo_redemptions_school_id_idx" ON "promo_redemptions"("school_id");
ALTER TABLE "promo_redemptions"
  ADD CONSTRAINT "promo_redemptions_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "promo_redemptions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Message templates ───────────────────────────────────────────────
CREATE TABLE "message_templates" (
  "id"            TEXT NOT NULL,
  "kind"          "MessageTemplateKind" NOT NULL,
  "key"           TEXT NOT NULL,
  "label"         TEXT NOT NULL,
  "description"   TEXT,
  "subject"       TEXT,
  "body"          TEXT NOT NULL,
  "merge_tags"    TEXT[] DEFAULT ARRAY[]::TEXT[],
  "is_active"     BOOLEAN NOT NULL DEFAULT true,
  "updated_by_id" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "message_templates_kind_key_key" ON "message_templates"("kind", "key");

CREATE TABLE "message_template_versions" (
  "id"           TEXT NOT NULL,
  "template_id"  TEXT NOT NULL,
  "version"      INTEGER NOT NULL,
  "subject"      TEXT,
  "body"         TEXT NOT NULL,
  "edited_by_id" TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_template_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "message_template_versions_template_id_version_key" ON "message_template_versions"("template_id", "version");
CREATE INDEX "message_template_versions_template_id_created_at_idx" ON "message_template_versions"("template_id", "created_at");
ALTER TABLE "message_template_versions"
  ADD CONSTRAINT "message_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Persistent announcements ────────────────────────────────────────
CREATE TABLE "platform_announcements" (
  "id"            TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "body"          TEXT NOT NULL,
  "type"          "PlatformAnnouncementType" NOT NULL DEFAULT 'INFO',
  "starts_at"     TIMESTAMP(3) NOT NULL,
  "ends_at"       TIMESTAMP(3),
  "target_plans"  "SchoolPlan"[] DEFAULT ARRAY[]::"SchoolPlan"[],
  "is_active"     BOOLEAN NOT NULL DEFAULT true,
  "dismissible"   BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT NOT NULL,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_announcements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "platform_announcements_is_active_starts_at_idx" ON "platform_announcements"("is_active", "starts_at");

-- ── NDPR ────────────────────────────────────────────────────────────
CREATE TABLE "data_access_logs" (
  "id"          TEXT NOT NULL,
  "staff_id"    TEXT NOT NULL,
  "school_id"   TEXT NOT NULL,
  "scope"       TEXT NOT NULL,
  "path"        TEXT NOT NULL,
  "duration_ms" INTEGER,
  "ip_address"  TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_access_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "data_access_logs_school_id_created_at_idx" ON "data_access_logs"("school_id", "created_at");
CREATE INDEX "data_access_logs_staff_id_created_at_idx" ON "data_access_logs"("staff_id", "created_at");
ALTER TABLE "data_access_logs"
  ADD CONSTRAINT "data_access_logs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "super_admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "data_access_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "data_subject_requests" (
  "id"             TEXT NOT NULL,
  "type"           "DataRequestType" NOT NULL,
  "status"         "DataRequestStatus" NOT NULL DEFAULT 'RECEIVED',
  "subject_name"   TEXT NOT NULL,
  "subject_email"  TEXT NOT NULL,
  "school_id"      TEXT,
  "user_id"        TEXT,
  "details"        TEXT,
  "received_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "due_at"         TIMESTAMP(3) NOT NULL,
  "completed_at"   TIMESTAMP(3),
  "resolution"     TEXT,
  "handled_by_id"  TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "data_subject_requests_status_due_at_idx" ON "data_subject_requests"("status", "due_at");

CREATE TABLE "data_deletion_records" (
  "id"             TEXT NOT NULL,
  "request_id"     TEXT NOT NULL,
  "school_id"      TEXT,
  "summary"        JSONB NOT NULL,
  "method"         TEXT NOT NULL,
  "executed_by_id" TEXT NOT NULL,
  "executed_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_deletion_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "data_deletion_records_request_id_idx" ON "data_deletion_records"("request_id");
ALTER TABLE "data_deletion_records"
  ADD CONSTRAINT "data_deletion_records_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "data_subject_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Sales pipeline ──────────────────────────────────────────────────
CREATE TABLE "leads" (
  "id"                  TEXT NOT NULL,
  "school_name"         TEXT NOT NULL,
  "contact_name"        TEXT NOT NULL,
  "contact_email"       TEXT,
  "contact_phone"       TEXT,
  "state"               TEXT,
  "size_estimate"       INTEGER,
  "source"              TEXT,
  "notes"               TEXT,
  "stage"               "LeadStage" NOT NULL DEFAULT 'NEW',
  "position"            DOUBLE PRECISION NOT NULL DEFAULT 1000,
  "owner_id"            TEXT,
  "converted_school_id" TEXT,
  "lost_reason"         TEXT,
  "stage_changed_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "leads_stage_position_idx" ON "leads"("stage", "position");

CREATE TABLE "referrals" (
  "id"                 TEXT NOT NULL,
  "referrer_school_id" TEXT NOT NULL,
  "code"               TEXT NOT NULL,
  "referred_school_id" TEXT,
  "status"             "ReferralStatus" NOT NULL DEFAULT 'PENDING',
  "reward_months"      INTEGER NOT NULL DEFAULT 0,
  "rewarded_at"        TIMESTAMP(3),
  "created_by_id"      TEXT,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "referrals_code_key" ON "referrals"("code");
CREATE INDEX "referrals_referrer_school_id_idx" ON "referrals"("referrer_school_id");
CREATE INDEX "referrals_status_idx" ON "referrals"("status");
ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_referrer_school_id_fkey" FOREIGN KEY ("referrer_school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "referrals_referred_school_id_fkey" FOREIGN KEY ("referred_school_id") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Seed the catalogue ──────────────────────────────────────────────
-- Prices mirror the demo seed's PLAN_PRICING so the console opens with a
-- catalogue that matches what schools are actually being charged.
INSERT INTO "plan_configs" ("id", "plan", "label", "monthly", "termly", "annual", "max_students", "storage_gb", "sms_credits", "modules", "created_at", "updated_at")
VALUES
  ('plancfg_starter',      'STARTER',      'Starter',       50000,  150000,   600000,  600,  5,   500, ARRAY['attendance','grades','communication'],                                                                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plancfg_growth',       'GROWTH',       'Growth',       116667,  350000,  1400000, 1200, 20,  2000, ARRAY['attendance','grades','finance','communication','elearning'],                                          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plancfg_professional', 'PROFESSIONAL', 'Professional', 233333,  700000,  2800000, 2500, 50,  5000, ARRAY['attendance','grades','finance','communication','elearning','library','ai_suite'],                     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plancfg_enterprise',   'ENTERPRISE',   'Enterprise',   400000, 1200000,  4800000, NULL, 200, 15000, ARRAY['attendance','grades','finance','communication','elearning','library','ai_suite','hostel','transport'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plancfg_government',   'GOVERNMENT',   'Government',   200000,  600000,  2400000, NULL, 100, 10000, ARRAY['attendance','grades','finance','communication','elearning','library','ai_suite','hostel','transport'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
