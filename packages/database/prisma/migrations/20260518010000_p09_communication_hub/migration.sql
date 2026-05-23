-- CreateEnum
CREATE TYPE "AnnouncementPriority" AS ENUM ('NORMAL', 'IMPORTANT', 'URGENT');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('SCHOOL_CLOSURE', 'SECURITY_INCIDENT', 'HEALTH_ALERT', 'OTHER');

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "SmsBatchStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "channels" "NotificationChannel"[],
ADD COLUMN     "priority" "AnnouncementPriority" NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "attachments" JSONB;

-- CreateTable
CREATE TABLE "sms_batches" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "sender_id" TEXT,
    "audience_label" TEXT NOT NULL,
    "audience_filter" JSONB,
    "message" TEXT NOT NULL,
    "status" "SmsBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sms_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_logs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "recipient_user_id" TEXT,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "SmsStatus" NOT NULL DEFAULT 'QUEUED',
    "provider_ref" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_alerts" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "sender_id" TEXT,
    "alert_type" "AlertType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "recipient_count" INTEGER NOT NULL,
    "channel_counts" JSONB NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "emergency_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sms_batches_school_id_status_idx" ON "sms_batches"("school_id", "status");

-- CreateIndex
CREATE INDEX "sms_batches_school_id_scheduled_at_idx" ON "sms_batches"("school_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "sms_batches_deleted_at_idx" ON "sms_batches"("deleted_at");

-- CreateIndex
CREATE INDEX "sms_logs_school_id_status_idx" ON "sms_logs"("school_id", "status");

-- CreateIndex
CREATE INDEX "sms_logs_school_id_phone_idx" ON "sms_logs"("school_id", "phone");

-- CreateIndex
CREATE INDEX "sms_logs_batch_id_idx" ON "sms_logs"("batch_id");

-- CreateIndex
CREATE INDEX "sms_logs_recipient_user_id_idx" ON "sms_logs"("recipient_user_id");

-- CreateIndex
CREATE INDEX "emergency_alerts_school_id_sent_at_idx" ON "emergency_alerts"("school_id", "sent_at");

-- CreateIndex
CREATE INDEX "emergency_alerts_school_id_alert_type_idx" ON "emergency_alerts"("school_id", "alert_type");

-- CreateIndex
CREATE INDEX "emergency_alerts_deleted_at_idx" ON "emergency_alerts"("deleted_at");

-- CreateIndex
CREATE INDEX "announcements_school_id_priority_idx" ON "announcements"("school_id", "priority");

-- CreateIndex
CREATE INDEX "messages_sender_id_receiver_id_created_at_idx" ON "messages"("sender_id", "receiver_id", "created_at");

-- AddForeignKey
ALTER TABLE "sms_batches" ADD CONSTRAINT "sms_batches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_batches" ADD CONSTRAINT "sms_batches_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "sms_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_alerts" ADD CONSTRAINT "emergency_alerts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_alerts" ADD CONSTRAINT "emergency_alerts_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

