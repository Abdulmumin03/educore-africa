-- AlterTable
ALTER TABLE "hostel_rooms" ADD COLUMN     "dorm_id" TEXT;

-- CreateTable
CREATE TABLE "hostel_dorms" (
    "id" TEXT NOT NULL,
    "hostel_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "hostel_dorms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hostel_dorms_deleted_at_idx" ON "hostel_dorms"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_dorms_hostel_id_name_key" ON "hostel_dorms"("hostel_id", "name");

-- CreateIndex
CREATE INDEX "hostel_rooms_dorm_id_idx" ON "hostel_rooms"("dorm_id");

-- AddForeignKey
ALTER TABLE "hostel_dorms" ADD CONSTRAINT "hostel_dorms_hostel_id_fkey" FOREIGN KEY ("hostel_id") REFERENCES "hostels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_dorm_id_fkey" FOREIGN KEY ("dorm_id") REFERENCES "hostel_dorms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
