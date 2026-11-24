-- Notes become a person's own documents instead of living inside one project (owner decision 2026-11-23). Parts of a
-- note are "project sections" (an editor node: { "type": "projectSection", "attrs": { "projectId": … } }); the
-- backend derives note_sections from them on every save, and each project page lists its sections.
--
-- Hand-written so existing notes keep their data: each note's owner becomes its project's owner, and its whole
-- content is wrapped in one section for that project (so every project page still shows what it showed before).

-- 1. The owner, from the note's project.
ALTER TABLE "notes" ADD COLUMN "user_id" UUID;
UPDATE "notes" n SET "user_id" = p."user_id" FROM "projects" p WHERE p."id" = n."project_id";
ALTER TABLE "notes" ALTER COLUMN "user_id" SET NOT NULL;

-- 2. Derived sections table.
CREATE TABLE "note_sections" (
    "note_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "project_id" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "content_text" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "note_sections_pkey" PRIMARY KEY ("note_id","position")
);

-- 3. Each existing note: its blocks (one empty paragraph for a note never written in) become one section for its
--    project, both in the note's content and in note_sections.
WITH blocks AS (
  SELECT "id", "project_id",
         CASE WHEN jsonb_typeof("content"->'content') = 'array' AND jsonb_array_length("content"->'content') > 0
              THEN "content"->'content'
              ELSE '[{"type": "paragraph"}]'::jsonb END AS "children"
    FROM "notes"
)
UPDATE "notes" n
   SET "content" = jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
         jsonb_build_object('type', 'projectSection', 'attrs', jsonb_build_object('projectId', b."project_id"::text),
                            'content', b."children")))
  FROM blocks b
 WHERE b."id" = n."id";

INSERT INTO "note_sections" ("note_id", "position", "project_id", "content", "content_text")
SELECT "id", 0, "project_id",
       jsonb_build_object('type', 'doc', 'content', "content"->'content'->0->'content'),
       "content_text"
  FROM "notes";

-- 4. The project link goes (its foreign key and index with it); notes are listed per person, newest first.
ALTER TABLE "notes" DROP COLUMN "project_id" CASCADE;

CREATE INDEX "note_sections_project_id_idx" ON "note_sections"("project_id");
CREATE INDEX "notes_user_id_created_at_idx" ON "notes"("user_id", "created_at" DESC);

-- Users are deactivated, never deleted: a note keeps its owner (RESTRICT), as projects do.
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "note_sections" ADD CONSTRAINT "note_sections_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- A deleted project drops its rows here; the text stays in the note (the editor shows the section as untagged and
-- the next save drops the stale project id).
ALTER TABLE "note_sections" ADD CONSTRAINT "note_sections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
