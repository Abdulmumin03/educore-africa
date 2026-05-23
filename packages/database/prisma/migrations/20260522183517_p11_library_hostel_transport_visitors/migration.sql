/*
  Warnings:

  - Changed the type of `gender` on the `hostels` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "HostelGenderType" AS ENUM ('MALE', 'FEMALE', 'MIXED');

-- CreateEnum
CREATE TYPE "ExeatStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PICKED_UP', 'RETURNED');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "IncidentLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "bus_routes" ADD COLUMN     "driver_staff_id" TEXT,
ADD COLUMN     "make" TEXT,
ADD COLUMN     "model" TEXT;

-- AlterTable
ALTER TABLE "hostel_assignments" ADD COLUMN     "bed_number" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "hostels" DROP COLUMN "gender",
ADD COLUMN     "gender" "HostelGenderType" NOT NULL;

-- AlterTable
ALTER TABLE "library_books" ADD COLUMN     "cover_url" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "publisher" TEXT,
ADD COLUMN     "subject_id" TEXT,
ADD COLUMN     "year" INTEGER;

-- CreateTable
CREATE TABLE "exeats" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "departure_date" TIMESTAMP(3) NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL,
    "destination" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ExeatStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "pickup_otp" TEXT,
    "pickup_confirmed_at" TIMESTAMP(3),
    "return_confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "exeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_incidents" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "hostel_id" TEXT NOT NULL,
    "student_id" TEXT,
    "reporter_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "action_taken" TEXT,
    "severity" "IncidentLevel" NOT NULL DEFAULT 'LOW',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "hostel_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_requests" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "hostel_id" TEXT NOT NULL,
    "room_id" TEXT,
    "issue_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reported_by_id" TEXT NOT NULL,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stops" (
    "id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "scheduled_time" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_route_assignments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "stop_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "student_route_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exeats_school_id_status_idx" ON "exeats"("school_id", "status");

-- CreateIndex
CREATE INDEX "exeats_student_id_idx" ON "exeats"("student_id");

-- CreateIndex
CREATE INDEX "exeats_deleted_at_idx" ON "exeats"("deleted_at");

-- CreateIndex
CREATE INDEX "hostel_incidents_school_id_occurred_at_idx" ON "hostel_incidents"("school_id", "occurred_at");

-- CreateIndex
CREATE INDEX "hostel_incidents_hostel_id_idx" ON "hostel_incidents"("hostel_id");

-- CreateIndex
CREATE INDEX "hostel_incidents_deleted_at_idx" ON "hostel_incidents"("deleted_at");

-- CreateIndex
CREATE INDEX "maintenance_requests_school_id_status_idx" ON "maintenance_requests"("school_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_requests_hostel_id_idx" ON "maintenance_requests"("hostel_id");

-- CreateIndex
CREATE INDEX "maintenance_requests_deleted_at_idx" ON "maintenance_requests"("deleted_at");

-- CreateIndex
CREATE INDEX "route_stops_route_id_idx" ON "route_stops"("route_id");

-- CreateIndex
CREATE INDEX "route_stops_deleted_at_idx" ON "route_stops"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_route_id_sequence_key" ON "route_stops"("route_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "student_route_assignments_student_id_key" ON "student_route_assignments"("student_id");

-- CreateIndex
CREATE INDEX "student_route_assignments_route_id_idx" ON "student_route_assignments"("route_id");

-- CreateIndex
CREATE INDEX "student_route_assignments_stop_id_idx" ON "student_route_assignments"("stop_id");

-- CreateIndex
CREATE INDEX "student_route_assignments_deleted_at_idx" ON "student_route_assignments"("deleted_at");

-- CreateIndex
CREATE INDEX "bus_routes_driver_staff_id_idx" ON "bus_routes"("driver_staff_id");

-- CreateIndex
CREATE INDEX "hostel_assignments_room_id_bed_number_idx" ON "hostel_assignments"("room_id", "bed_number");

-- CreateIndex
CREATE INDEX "library_books_subject_id_idx" ON "library_books"("subject_id");

-- AddForeignKey
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_routes" ADD CONSTRAINT "bus_routes_driver_staff_id_fkey" FOREIGN KEY ("driver_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exeats" ADD CONSTRAINT "exeats_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exeats" ADD CONSTRAINT "exeats_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exeats" ADD CONSTRAINT "exeats_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_incidents" ADD CONSTRAINT "hostel_incidents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_incidents" ADD CONSTRAINT "hostel_incidents_hostel_id_fkey" FOREIGN KEY ("hostel_id") REFERENCES "hostels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_incidents" ADD CONSTRAINT "hostel_incidents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_incidents" ADD CONSTRAINT "hostel_incidents_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_hostel_id_fkey" FOREIGN KEY ("hostel_id") REFERENCES "hostels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "hostel_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "bus_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_route_assignments" ADD CONSTRAINT "student_route_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_route_assignments" ADD CONSTRAINT "student_route_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_route_assignments" ADD CONSTRAINT "student_route_assignments_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "bus_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_route_assignments" ADD CONSTRAINT "student_route_assignments_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "route_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
