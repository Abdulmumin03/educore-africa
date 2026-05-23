-- CreateEnum
CREATE TYPE "LessonMethodology" AS ENUM ('LECTURE', 'DISCUSSION', 'PRACTICAL', 'MIXED');

-- CreateEnum
CREATE TYPE "ResourceKind" AS ENUM ('PDF', 'VIDEO', 'IMAGE', 'AUDIO');

-- AlterTable
ALTER TABLE "assignment_submissions" ADD COLUMN     "attachments" JSONB;

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "allow_late" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "instructions_md" TEXT,
ADD COLUMN     "section_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "lesson_plans" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "section_id" TEXT,
    "date" DATE NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 40,
    "topic" TEXT NOT NULL,
    "subtopic" TEXT,
    "objectives" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "methodology" "LessonMethodology" NOT NULL DEFAULT 'LECTURE',
    "materials" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "content_md" TEXT NOT NULL,
    "assessment" TEXT,
    "homework" TEXT,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "parent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "ResourceKind" NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "subject_id" TEXT,
    "class_level" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_date_idx" ON "lesson_plans"("school_id", "date");

-- CreateIndex
CREATE INDEX "lesson_plans_author_id_date_idx" ON "lesson_plans"("author_id", "date");

-- CreateIndex
CREATE INDEX "lesson_plans_subject_id_class_id_idx" ON "lesson_plans"("subject_id", "class_id");

-- CreateIndex
CREATE INDEX "lesson_plans_deleted_at_idx" ON "lesson_plans"("deleted_at");

-- CreateIndex
CREATE INDEX "resources_school_id_subject_id_class_level_idx" ON "resources"("school_id", "subject_id", "class_level");

-- CreateIndex
CREATE INDEX "resources_school_id_kind_idx" ON "resources"("school_id", "kind");

-- CreateIndex
CREATE INDEX "resources_deleted_at_idx" ON "resources"("deleted_at");

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "lesson_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
