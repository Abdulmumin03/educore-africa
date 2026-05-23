-- CreateEnum
CREATE TYPE "FeeCategory" AS ENUM ('TUITION', 'LEVY', 'UNIFORM', 'BOOKS', 'TRANSPORT', 'HOSTEL', 'EXAM', 'PTA', 'OTHER');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('SIBLING', 'STAFF_CHILD', 'SCHOLARSHIP', 'NEED_BASED', 'MANUAL');

-- CreateEnum
CREATE TYPE "DiscountStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentChannel" ADD VALUE 'POS';
ALTER TYPE "PaymentChannel" ADD VALUE 'CHEQUE';

-- DropIndex
DROP INDEX "fee_structures_academic_year_id_class_id_name_key";

-- DropIndex
DROP INDEX "fee_structures_school_id_idx";

-- AlterTable
ALTER TABLE "fee_invoices" ADD COLUMN     "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount_reason" TEXT,
ADD COLUMN     "items" JSONB,
ADD COLUMN     "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "fee_structures" ADD COLUMN     "category" "FeeCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "due_date" DATE,
ADD COLUMN     "term_id" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "evidence_url" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "recorded_by_id" TEXT;

-- CreateTable
CREATE TABLE "fee_discounts" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "percent" DECIMAL(5,2),
    "fixed_amount" DECIMAL(12,2),
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "auto_apply" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fee_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_discounts" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "discount_id" TEXT NOT NULL,
    "status" "DiscountStatus" NOT NULL DEFAULT 'APPROVED',
    "requested_by_id" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "reason" TEXT,
    "valid_from_term_id" TEXT,
    "valid_until_term_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "student_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_discounts_school_id_is_active_idx" ON "fee_discounts"("school_id", "is_active");

-- CreateIndex
CREATE INDEX "fee_discounts_deleted_at_idx" ON "fee_discounts"("deleted_at");

-- CreateIndex
CREATE INDEX "student_discounts_school_id_status_idx" ON "student_discounts"("school_id", "status");

-- CreateIndex
CREATE INDEX "student_discounts_student_id_idx" ON "student_discounts"("student_id");

-- CreateIndex
CREATE INDEX "student_discounts_deleted_at_idx" ON "student_discounts"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "student_discounts_student_id_discount_id_key" ON "student_discounts"("student_id", "discount_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_invoices_student_id_term_id_key" ON "fee_invoices"("student_id", "term_id");

-- CreateIndex
CREATE INDEX "fee_structures_school_id_term_id_idx" ON "fee_structures"("school_id", "term_id");

-- CreateIndex
CREATE INDEX "fee_structures_class_id_idx" ON "fee_structures"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_academic_year_id_term_id_class_id_name_key" ON "fee_structures"("academic_year_id", "term_id", "class_id", "name");

-- CreateIndex
CREATE INDEX "payments_provider_ref_idx" ON "payments"("provider_ref");

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "fee_discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

