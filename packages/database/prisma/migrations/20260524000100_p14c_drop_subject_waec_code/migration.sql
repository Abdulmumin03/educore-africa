-- P14c: drop Subject.waec_code now that codes live per-pairing in subject_curricula.

-- Lift any remaining waec_code values into the WAEC-curriculum pairing, when
-- the join row exists and has no external_code yet. After the PR1 backfill
-- this should usually be a no-op, but it makes the column drop safe.
UPDATE "subject_curricula" sc
SET "external_code" = sub.waec_code
FROM "subjects" sub, "curricula" cur
WHERE sc.subject_id = sub.id
  AND sc.curriculum_id = cur.id
  AND sub.waec_code IS NOT NULL
  AND sc.external_code IS NULL
  AND cur.exam_body_code = 'WAEC'
  AND cur.deleted_at IS NULL
  AND sub.deleted_at IS NULL;

-- Drop the column.
ALTER TABLE "subjects" DROP COLUMN "waec_code";
