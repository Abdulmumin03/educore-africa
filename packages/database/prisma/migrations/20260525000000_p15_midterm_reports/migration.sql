-- P15: Midterm reports — schools can issue an interim report off CA1 +
-- mid-term components without computing the full term-end report card.

-- Curriculum config: which caComponents add up to the midterm score.
-- Must be a subset of gradingScale.caComponents (enforced in the API).
ALTER TABLE "curricula"
  ADD COLUMN "midterm_components" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Sensible defaults so existing schools' default WAEC curriculum has
-- something to use out of the box. Schools refine in Settings → Curricula.
UPDATE "curricula"
SET "midterm_components" = '["CA1","Mid-Term"]'::jsonb
WHERE "exam_body_code" IN ('WAEC', 'NECO')
  AND "midterm_components" = '[]'::jsonb;

UPDATE "curricula"
SET "midterm_components" = '["Coursework 1","Practical"]'::jsonb
WHERE "exam_body_code" = 'CAMBRIDGE'
  AND "midterm_components" = '[]'::jsonb;

-- Per-student midterm report row. Only stores comments + lock state — scores
-- are computed live from Grade.caComponents on every render.
CREATE TABLE "midterm_reports" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "class_teacher_comment" TEXT,
    "principal_comment" TEXT,
    "ai_principal" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" TIMESTAMP(3),
    "generated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "midterm_reports_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "midterm_reports_student_id_term_id_key"
  ON "midterm_reports"("student_id", "term_id");
CREATE INDEX "midterm_reports_school_id_term_id_idx"
  ON "midterm_reports"("school_id", "term_id");
CREATE INDEX "midterm_reports_deleted_at_idx"
  ON "midterm_reports"("deleted_at");

-- Foreign keys
ALTER TABLE "midterm_reports" ADD CONSTRAINT "midterm_reports_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "midterm_reports" ADD CONSTRAINT "midterm_reports_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "midterm_reports" ADD CONSTRAINT "midterm_reports_term_id_fkey"
  FOREIGN KEY ("term_id") REFERENCES "terms"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
