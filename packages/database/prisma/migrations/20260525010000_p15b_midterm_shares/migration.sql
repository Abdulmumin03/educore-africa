-- P15b: shareable parent-facing midterm-report links (mirrors report_card_shares).

CREATE TABLE "midterm_report_shares" (
    "id" TEXT NOT NULL,
    "midterm_report_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accesses" INTEGER NOT NULL DEFAULT 0,
    "last_access_at" TIMESTAMP(3),
    "sms_sent_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "midterm_report_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "midterm_report_shares_token_key"
  ON "midterm_report_shares"("token");
CREATE INDEX "midterm_report_shares_midterm_report_id_idx"
  ON "midterm_report_shares"("midterm_report_id");
CREATE INDEX "midterm_report_shares_expires_at_idx"
  ON "midterm_report_shares"("expires_at");

ALTER TABLE "midterm_report_shares" ADD CONSTRAINT "midterm_report_shares_midterm_report_id_fkey"
  FOREIGN KEY ("midterm_report_id") REFERENCES "midterm_reports"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
