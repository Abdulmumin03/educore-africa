-- CreateEnum
CREATE TYPE "StaffType" AS ENUM ('TEACHING', 'NON_TEACHING', 'ADMIN', 'CONTRACT', 'NYSC');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED', 'RETIRED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'EMERGENCY', 'STUDY', 'UNPAID');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('DRAFT', 'FINAL');

-- CreateEnum
CREATE TYPE "StaffAttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'REMOTE', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "TrainingType" AS ENUM ('CERTIFICATION', 'COURSE', 'WORKSHOP', 'CONFERENCE', 'IN_HOUSE');

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "account_name" TEXT,
ADD COLUMN     "account_number" TEXT,
ADD COLUMN     "allowances" JSONB,
ADD COLUMN     "bank_name" TEXT,
ADD COLUMN     "basic_salary" DECIMAL(12,2),
ADD COLUMN     "bvn" TEXT,
ADD COLUMN     "date_of_birth" DATE,
ADD COLUMN     "deductions" JSONB,
ADD COLUMN     "experience_years" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "middle_name" TEXT,
ADD COLUMN     "nin" TEXT,
ADD COLUMN     "staff_type" "StaffType" NOT NULL DEFAULT 'TEACHING',
ADD COLUMN     "state_of_origin" TEXT,
ADD COLUMN     "status" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "staff_documents" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "staff_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_section_assignments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "is_form_teacher" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_section_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "StaffAttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "check_in_at" TIMESTAMP(3),
    "check_out_at" TIMESTAMP(3),
    "remark" TEXT,
    "term_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_policies" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "leave_type" "LeaveType" NOT NULL,
    "default_days" INTEGER NOT NULL DEFAULT 0,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "leave_type" "LeaveType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "days_requested" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "attachment_url" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewer_comment" TEXT,
    "substitute_staff_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "processed_at" TIMESTAMP(3),
    "processed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "payroll_period_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "basic_salary" DECIMAL(12,2) NOT NULL,
    "allowances" JSONB NOT NULL,
    "deductions" JSONB NOT NULL,
    "gross" DECIMAL(12,2) NOT NULL,
    "net" DECIMAL(12,2) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'DRAFT',
    "pass_rate" DOUBLE PRECISION,
    "attendance_rate" DOUBLE PRECISION,
    "lesson_plan_rate" DOUBLE PRECISION,
    "parent_score" DOUBLE PRECISION,
    "principal_comment" TEXT,
    "ai_summary" TEXT,
    "ai_model" TEXT,
    "final_score" DOUBLE PRECISION,
    "badge" TEXT,
    "evaluator_id" TEXT,
    "finalized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_logs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "provider" TEXT,
    "type" "TrainingType" NOT NULL DEFAULT 'COURSE',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "certificate_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "training_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_documents_school_id_idx" ON "staff_documents"("school_id");

-- CreateIndex
CREATE INDEX "staff_documents_staff_id_idx" ON "staff_documents"("staff_id");

-- CreateIndex
CREATE INDEX "staff_documents_deleted_at_idx" ON "staff_documents"("deleted_at");

-- CreateIndex
CREATE INDEX "staff_section_assignments_school_id_academic_year_id_idx" ON "staff_section_assignments"("school_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "staff_section_assignments_section_id_idx" ON "staff_section_assignments"("section_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_section_assignments_staff_id_section_id_academic_year_key" ON "staff_section_assignments"("staff_id", "section_id", "academic_year_id", "subject_id");

-- CreateIndex
CREATE INDEX "staff_attendance_school_id_date_idx" ON "staff_attendance"("school_id", "date");

-- CreateIndex
CREATE INDEX "staff_attendance_staff_id_term_id_idx" ON "staff_attendance"("staff_id", "term_id");

-- CreateIndex
CREATE INDEX "staff_attendance_deleted_at_idx" ON "staff_attendance"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_staff_id_date_key" ON "staff_attendance"("staff_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "leave_policies_school_id_leave_type_key" ON "leave_policies"("school_id", "leave_type");

-- CreateIndex
CREATE INDEX "leave_requests_school_id_status_idx" ON "leave_requests"("school_id", "status");

-- CreateIndex
CREATE INDEX "leave_requests_staff_id_start_date_idx" ON "leave_requests"("staff_id", "start_date");

-- CreateIndex
CREATE INDEX "leave_requests_deleted_at_idx" ON "leave_requests"("deleted_at");

-- CreateIndex
CREATE INDEX "payroll_periods_school_id_start_date_idx" ON "payroll_periods"("school_id", "start_date");

-- CreateIndex
CREATE INDEX "payroll_periods_deleted_at_idx" ON "payroll_periods"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_school_id_name_key" ON "payroll_periods"("school_id", "name");

-- CreateIndex
CREATE INDEX "payslips_school_id_paid_at_idx" ON "payslips"("school_id", "paid_at");

-- CreateIndex
CREATE INDEX "payslips_staff_id_idx" ON "payslips"("staff_id");

-- CreateIndex
CREATE INDEX "payslips_deleted_at_idx" ON "payslips"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_payroll_period_id_staff_id_key" ON "payslips"("payroll_period_id", "staff_id");

-- CreateIndex
CREATE INDEX "evaluations_school_id_term_id_idx" ON "evaluations"("school_id", "term_id");

-- CreateIndex
CREATE INDEX "evaluations_deleted_at_idx" ON "evaluations"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_staff_id_term_id_key" ON "evaluations"("staff_id", "term_id");

-- CreateIndex
CREATE INDEX "training_logs_school_id_idx" ON "training_logs"("school_id");

-- CreateIndex
CREATE INDEX "training_logs_staff_id_start_date_idx" ON "training_logs"("staff_id", "start_date");

-- CreateIndex
CREATE INDEX "training_logs_deleted_at_idx" ON "training_logs"("deleted_at");

-- CreateIndex
CREATE INDEX "staff_school_id_staff_type_idx" ON "staff"("school_id", "staff_type");

-- CreateIndex
CREATE INDEX "staff_school_id_status_idx" ON "staff"("school_id", "status");

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_section_assignments" ADD CONSTRAINT "staff_section_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_section_assignments" ADD CONSTRAINT "staff_section_assignments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_section_assignments" ADD CONSTRAINT "staff_section_assignments_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_section_assignments" ADD CONSTRAINT "staff_section_assignments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_section_assignments" ADD CONSTRAINT "staff_section_assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_substitute_staff_id_fkey" FOREIGN KEY ("substitute_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_logs" ADD CONSTRAINT "training_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_logs" ADD CONSTRAINT "training_logs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
