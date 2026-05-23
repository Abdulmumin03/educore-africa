-- P16: Report templates — schools customise colours, sections, signatures
-- and custom text for grade + midterm reports. PR1 ships the schema only;
-- the visual stays identical because resolveTemplate() falls back to a
-- builtin default when no row exists.

CREATE TYPE "ReportTemplateKind" AS ENUM ('GRADE', 'MIDTERM');

CREATE TABLE "report_templates" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "curriculum_id" TEXT,
    "kind" "ReportTemplateKind" NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "report_templates_school_id_kind_name_key"
  ON "report_templates"("school_id", "kind", "name");
CREATE INDEX "report_templates_school_id_kind_idx"
  ON "report_templates"("school_id", "kind");
CREATE INDEX "report_templates_curriculum_id_idx"
  ON "report_templates"("curriculum_id");
CREATE INDEX "report_templates_deleted_at_idx"
  ON "report_templates"("deleted_at");

-- Foreign keys
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_curriculum_id_fkey"
  FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
