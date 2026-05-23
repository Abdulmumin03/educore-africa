-- P14 Curricula: per-school curriculum definitions, shared subjects via join.

-- CreateTable
CREATE TABLE "curricula" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exam_body_code" TEXT NOT NULL DEFAULT 'NONE',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "grading_scale" JSONB NOT NULL,
    "ai_prompt_hint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "curricula_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "curricula_school_id_code_key" ON "curricula"("school_id", "code");
CREATE INDEX "curricula_school_id_idx" ON "curricula"("school_id");
CREATE INDEX "curricula_deleted_at_idx" ON "curricula"("deleted_at");

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "subject_curricula" (
    "subject_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,
    "external_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subject_curricula_pkey" PRIMARY KEY ("subject_id", "curriculum_id")
);

-- CreateIndex
CREATE INDEX "subject_curricula_curriculum_id_idx" ON "subject_curricula"("curriculum_id");

-- AddForeignKey
ALTER TABLE "subject_curricula" ADD CONSTRAINT "subject_curricula_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subject_curricula" ADD CONSTRAINT "subject_curricula_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add curriculum_id to classes
ALTER TABLE "classes" ADD COLUMN "curriculum_id" TEXT;

-- CreateIndex
CREATE INDEX "classes_curriculum_id_idx" ON "classes"("curriculum_id");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one default WAEC curriculum per school, using school.settings.grading or the WAEC default.
INSERT INTO "curricula" ("id", "school_id", "code", "name", "exam_body_code", "is_default", "grading_scale", "ai_prompt_hint", "created_at", "updated_at")
SELECT
    'cur_' || substr(md5(random()::text || s.id), 1, 24) AS id,
    s.id AS school_id,
    'WAEC' AS code,
    'WAEC (NERDC)' AS name,
    'WAEC' AS exam_body_code,
    true AS is_default,
    COALESCE(
        s.settings -> 'grading',
        '{
            "scale": [
                {"grade":"A1","minScore":75,"maxScore":100,"points":4.0,"remark":"Excellent"},
                {"grade":"B2","minScore":70,"maxScore":74,"points":3.5,"remark":"Very good"},
                {"grade":"B3","minScore":65,"maxScore":69,"points":3.0,"remark":"Good"},
                {"grade":"C4","minScore":60,"maxScore":64,"points":2.5,"remark":"Credit"},
                {"grade":"C5","minScore":55,"maxScore":59,"points":2.0,"remark":"Credit"},
                {"grade":"C6","minScore":50,"maxScore":54,"points":1.5,"remark":"Credit"},
                {"grade":"D7","minScore":45,"maxScore":49,"points":1.0,"remark":"Pass"},
                {"grade":"E8","minScore":40,"maxScore":44,"points":0.5,"remark":"Pass"},
                {"grade":"F9","minScore":0,"maxScore":39,"points":0.0,"remark":"Fail"}
            ],
            "caWeight": 40,
            "examWeight": 60,
            "caComponents": ["CA1","CA2","Mid-Term","Assignment"],
            "positionRanking": true
        }'::jsonb
    ) AS grading_scale,
    'Aligned with the NERDC curriculum. Match the style of WAEC / NECO papers.' AS ai_prompt_hint,
    NOW() AS created_at,
    NOW() AS updated_at
FROM "schools" s
WHERE s.deleted_at IS NULL;

-- Point existing classes at their school's default curriculum.
UPDATE "classes" c
SET "curriculum_id" = cur.id
FROM "curricula" cur
WHERE cur.school_id = c.school_id
  AND cur.is_default = true
  AND c.curriculum_id IS NULL;

-- Attach all existing subjects to their school's default curriculum,
-- copying waec_code into the join row.
INSERT INTO "subject_curricula" ("subject_id", "curriculum_id", "external_code", "created_at")
SELECT sub.id, cur.id, sub.waec_code, NOW()
FROM "subjects" sub
JOIN "curricula" cur ON cur.school_id = sub.school_id AND cur.is_default = true
WHERE sub.deleted_at IS NULL
ON CONFLICT DO NOTHING;
