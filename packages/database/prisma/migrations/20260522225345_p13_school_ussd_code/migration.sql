-- AlterTable
ALTER TABLE "schools" ADD COLUMN "ussd_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "schools_ussd_code_key" ON "schools"("ussd_code");
