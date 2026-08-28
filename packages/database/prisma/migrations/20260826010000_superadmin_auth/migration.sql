-- SA-01: authentication, MFA and session security for the Super Admin Console.

-- ─── Lockout counters + TOTP enrolment state ──────────────────────
ALTER TABLE "super_admin_users"
  ADD COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "locked_until" TIMESTAMP(3),
  ADD COLUMN "totp_confirmed_at" TIMESTAMP(3);

-- ─── Sessions: sliding idle window + fixed 8h ceiling + revocation ─
ALTER TABLE "super_admin_sessions"
  ADD COLUMN "absolute_expires_at" TIMESTAMP(3),
  ADD COLUMN "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "revoked_at" TIMESTAMP(3),
  ADD COLUMN "revoked_reason" TEXT;

-- Backfill: pre-SA-01 rows carried a single 8h expiry, so that IS the ceiling.
UPDATE "super_admin_sessions" SET "absolute_expires_at" = "expires_at"
  WHERE "absolute_expires_at" IS NULL;

ALTER TABLE "super_admin_sessions" ALTER COLUMN "absolute_expires_at" SET NOT NULL;

CREATE INDEX "super_admin_sessions_user_id_revoked_at_idx"
  ON "super_admin_sessions"("user_id", "revoked_at");

-- ─── Audit log: allow rows with no attributable account ───────────
-- IP_BLOCKED and LOGIN_FAILED against an unknown email have no user to point
-- at, and those are precisely the rows worth keeping.
ALTER TABLE "super_admin_audit_logs" DROP CONSTRAINT "super_admin_audit_logs_user_id_fkey";
ALTER TABLE "super_admin_audit_logs" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "super_admin_audit_logs" ADD CONSTRAINT "super_admin_audit_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "super_admin_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "super_admin_audit_logs_action_idx" ON "super_admin_audit_logs"("action");

-- ─── One-time backup codes ────────────────────────────────────────
CREATE TABLE "super_admin_backup_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admin_backup_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "super_admin_backup_codes_user_id_idx" ON "super_admin_backup_codes"("user_id");

ALTER TABLE "super_admin_backup_codes" ADD CONSTRAINT "super_admin_backup_codes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "super_admin_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Trusted devices (skip MFA for 30 days) ───────────────────────
CREATE TABLE "super_admin_trusted_devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admin_trusted_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "super_admin_trusted_devices_token_hash_key"
  ON "super_admin_trusted_devices"("token_hash");
CREATE INDEX "super_admin_trusted_devices_user_id_idx" ON "super_admin_trusted_devices"("user_id");
CREATE INDEX "super_admin_trusted_devices_expires_at_idx"
  ON "super_admin_trusted_devices"("expires_at");

ALTER TABLE "super_admin_trusted_devices" ADD CONSTRAINT "super_admin_trusted_devices_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "super_admin_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
