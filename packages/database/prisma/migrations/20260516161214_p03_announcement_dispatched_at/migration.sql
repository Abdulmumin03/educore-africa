-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "dispatched_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "announcements_dispatched_at_published_at_idx" ON "announcements"("dispatched_at", "published_at");
