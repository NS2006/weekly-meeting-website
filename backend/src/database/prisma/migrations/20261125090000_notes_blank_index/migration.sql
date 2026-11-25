-- Stress-test review, 2026-11-25 (hand-written: Prisma cannot express either index).

-- 1. The full-text index on notes was never used (the Notes search is ILIKE on the person's own notes), yet every
--    autosave rebuilt its entry; with 278,000 notes it was the largest index (57 MB).
DROP INDEX IF EXISTS "notes_fts_idx";

-- 2. Blank notes (no title, no text, no picture: just started) are left out of each meeting's note count. Checking every
--    note read a team's whole history (17,000 notes for a 151-person team); the count is now every link less the blank
--    ones, answered from this small index. Its condition must stay exactly BLANK in
--    backend/src/modules/meetings/repository.ts, or PostgreSQL will not use it.
CREATE INDEX "notes_blank_idx" ON "notes" ("id")
  WHERE "title" = '' AND "content_text" = '' AND NOT jsonb_path_exists("content", 'strict $.** ? (@.type == "image")');
