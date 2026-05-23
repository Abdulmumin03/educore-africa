-- CreateEnum
CREATE TYPE "AdmissionType" AS ENUM ('NEW', 'TRANSFER', 'RE_ADMISSION');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'GRADUATED', 'TRANSFERRED', 'WITHDRAWN', 'SUSPENDED', 'DECEASED');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('MINOR', 'MODERATE', 'SEVERE');

-- AlterTable
ALTER TABLE "parents" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "student_parents" ADD COLUMN     "can_pickup" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_emergency_contact" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "admission_type" "AdmissionType" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "disabilities" TEXT,
ADD COLUMN     "doctor_name" TEXT,
ADD COLUMN     "doctor_phone" TEXT,
ADD COLUMN     "emergency_medical_consent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "known_allergies" TEXT,
ADD COLUMN     "lga" TEXT,
ADD COLUMN     "medical_insurance" TEXT,
ADD COLUMN     "middle_name" TEXT,
ADD COLUMN     "nationality" TEXT NOT NULL DEFAULT 'Nigerian',
ADD COLUMN     "previous_class" TEXT,
ADD COLUMN     "previous_school" TEXT,
ADD COLUMN     "reason_for_transfer" TEXT,
ADD COLUMN     "religion" TEXT,
ADD COLUMN     "special_needs" TEXT,
ADD COLUMN     "state_of_origin" TEXT,
ADD COLUMN     "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "health_entries" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "action_taken" TEXT,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "health_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_logs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "action_taken" TEXT,
    "counselor_notes" TEXT,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "behavior_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_documents" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "url" TEXT NOT NULL,
    "file_size" INTEGER,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_entries_school_id_idx" ON "health_entries"("school_id");

-- CreateIndex
CREATE INDEX "health_entries_student_id_date_idx" ON "health_entries"("student_id", "date");

-- CreateIndex
CREATE INDEX "health_entries_deleted_at_idx" ON "health_entries"("deleted_at");

-- CreateIndex
CREATE INDEX "behavior_logs_school_id_date_idx" ON "behavior_logs"("school_id", "date");

-- CreateIndex
CREATE INDEX "behavior_logs_student_id_date_idx" ON "behavior_logs"("student_id", "date");

-- CreateIndex
CREATE INDEX "behavior_logs_severity_idx" ON "behavior_logs"("severity");

-- CreateIndex
CREATE INDEX "behavior_logs_deleted_at_idx" ON "behavior_logs"("deleted_at");

-- CreateIndex
CREATE INDEX "student_documents_school_id_idx" ON "student_documents"("school_id");

-- CreateIndex
CREATE INDEX "student_documents_student_id_idx" ON "student_documents"("student_id");

-- CreateIndex
CREATE INDEX "student_documents_deleted_at_idx" ON "student_documents"("deleted_at");

-- AddForeignKey
ALTER TABLE "health_entries" ADD CONSTRAINT "health_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_entries" ADD CONSTRAINT "health_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_logs" ADD CONSTRAINT "behavior_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_logs" ADD CONSTRAINT "behavior_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
