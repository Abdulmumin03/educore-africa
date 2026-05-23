-- AlterTable
ALTER TABLE "grades" ADD COLUMN     "ca_components" JSONB,
ADD COLUMN     "position" INTEGER,
ADD COLUMN     "teacher_remark" TEXT;

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "waec_code" TEXT;

-- CreateTable
CREATE TABLE "report_cards" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "principal_comment" TEXT,
    "ai_principal" BOOLEAN NOT NULL DEFAULT false,
    "class_teacher_comment" TEXT,
    "total_score" DOUBLE PRECISION,
    "average_score" DOUBLE PRECISION,
    "position" INTEGER,
    "position_out_of" INTEGER,
    "days_present" INTEGER,
    "school_days" INTEGER,
    "locked_at" TIMESTAMP(3),
    "generated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "report_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_card_shares" (
    "id" TEXT NOT NULL,
    "report_card_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accesses" INTEGER NOT NULL DEFAULT 0,
    "last_access_at" TIMESTAMP(3),
    "sms_sent_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_card_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_imports" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "section_id" TEXT,
    "subject_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "imported_by_id" TEXT,
    "rows_attempted" INTEGER NOT NULL DEFAULT 0,
    "rows_imported" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_cards_school_id_term_id_idx" ON "report_cards"("school_id", "term_id");

-- CreateIndex
CREATE INDEX "report_cards_deleted_at_idx" ON "report_cards"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "report_cards_student_id_term_id_key" ON "report_cards"("student_id", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_card_shares_token_key" ON "report_card_shares"("token");

-- CreateIndex
CREATE INDEX "report_card_shares_report_card_id_idx" ON "report_card_shares"("report_card_id");

-- CreateIndex
CREATE INDEX "report_card_shares_expires_at_idx" ON "report_card_shares"("expires_at");

-- CreateIndex
CREATE INDEX "grade_imports_school_id_created_at_idx" ON "grade_imports"("school_id", "created_at");

-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_card_shares" ADD CONSTRAINT "report_card_shares_report_card_id_fkey" FOREIGN KEY ("report_card_id") REFERENCES "report_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_imports" ADD CONSTRAINT "grade_imports_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
