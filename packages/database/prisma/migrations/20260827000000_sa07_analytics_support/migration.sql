-- SA-07: voice of customer, broadcast history, and SLA timestamps on tickets.

ALTER TABLE "support_tickets"
  ADD COLUMN "first_response_at" TIMESTAMP(3),
  ADD COLUMN "escalated_at" TIMESTAMP(3);

-- Backfill: the earliest staff (non-internal) comment IS the first response
-- for every ticket that already has one.
UPDATE "support_tickets" t
SET "first_response_at" = c.first_at
FROM (
  SELECT "ticket_id", min("created_at") AS first_at
  FROM "ticket_comments"
  WHERE "is_internal" = false
  GROUP BY "ticket_id"
) c
WHERE c."ticket_id" = t."id";

CREATE TYPE "NpsRole" AS ENUM ('SCHOOL_ADMIN', 'TEACHER', 'PARENT', 'STUDENT');

CREATE TABLE "nps_responses" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "user_id" TEXT,
    "role" "NpsRole" NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nps_responses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "nps_responses_school_id_idx" ON "nps_responses"("school_id");
CREATE INDEX "nps_responses_created_at_idx" ON "nps_responses"("created_at");
CREATE INDEX "nps_responses_role_idx" ON "nps_responses"("role");

ALTER TABLE "nps_responses" ADD CONSTRAINT "nps_responses_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "BroadcastAudience" AS ENUM ('ALL', 'BY_PLAN', 'BY_STATE', 'BY_STATUS', 'CUSTOM');

CREATE TABLE "broadcasts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "BroadcastAudience" NOT NULL,
    "audience_filter" JSONB,
    "channels" "NotificationChannel"[],
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_for" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "school_count" INTEGER NOT NULL DEFAULT 0,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "in_app_sent" INTEGER NOT NULL DEFAULT 0,
    "estimated_sms_cost" DECIMAL(12,2),
    "failure_reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "broadcasts_status_idx" ON "broadcasts"("status");
CREATE INDEX "broadcasts_created_at_idx" ON "broadcasts"("created_at");
