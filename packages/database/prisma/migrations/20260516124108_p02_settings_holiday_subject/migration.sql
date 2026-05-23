-- CreateEnum
CREATE TYPE "SubjectCategory" AS ENUM ('CORE', 'ELECTIVE', 'TRADE');

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "accreditation_number" TEXT,
ADD COLUMN     "ministry_reg_number" TEXT,
ADD COLUMN     "settings" JSONB,
ADD COLUMN     "slogan" TEXT;

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "category" "SubjectCategory" NOT NULL DEFAULT 'CORE',
ADD COLUMN     "credit_units" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "holidays_school_id_start_date_idx" ON "holidays"("school_id", "start_date");

-- CreateIndex
CREATE INDEX "holidays_deleted_at_idx" ON "holidays"("deleted_at");

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
