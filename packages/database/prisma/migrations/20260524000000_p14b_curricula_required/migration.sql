-- P14b: lock Class.curriculum_id to NOT NULL with ON DELETE RESTRICT.

-- Backfill any classes still missing a curriculum to their school's default.
UPDATE "classes" c
SET "curriculum_id" = cur.id
FROM "curricula" cur
WHERE cur.school_id = c.school_id
  AND cur.is_default = true
  AND cur.deleted_at IS NULL
  AND c.curriculum_id IS NULL
  AND c.deleted_at IS NULL;

-- Soft-deleted classes that still have no curriculum: tie them to any
-- curriculum belonging to the school (default if present, otherwise first).
UPDATE "classes" c
SET "curriculum_id" = (
  SELECT cur.id FROM "curricula" cur
  WHERE cur.school_id = c.school_id AND cur.deleted_at IS NULL
  ORDER BY cur.is_default DESC, cur.created_at ASC
  LIMIT 1
)
WHERE c.curriculum_id IS NULL;

-- Replace nullable FK with non-null + RESTRICT.
ALTER TABLE "classes" DROP CONSTRAINT "classes_curriculum_id_fkey";
ALTER TABLE "classes" ALTER COLUMN "curriculum_id" SET NOT NULL;
ALTER TABLE "classes"
  ADD CONSTRAINT "classes_curriculum_id_fkey"
  FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
