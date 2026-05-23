-- P14d: strip the legacy grading key from school.settings — grading config
-- now lives on Curriculum rows. Settings retains only notifications.

UPDATE "schools"
SET "settings" = "settings" - 'grading'
WHERE "settings" IS NOT NULL
  AND "settings" ? 'grading';
