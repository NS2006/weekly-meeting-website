-- Every id becomes a random UUID (gen_random_uuid(), built into PostgreSQL 13+), so ids in addresses such as
-- /projects/<id> can neither be guessed nor counted. Access checks stay as they are; this is defence in depth.
--
-- Hand-written so existing rows keep their data: each row gets a new UUID, every reference is rewritten to it
-- (including image sources inside note content), then the old BIGINT columns are dropped and the constraints and
-- indexes are recreated under their previous names. Runs in one transaction (Prisma Migrate wraps it).

-- 1. A UUID for every row.
ALTER TABLE "users"          ADD COLUMN "uid" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "teams"          ADD COLUMN "uid" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "projects"       ADD COLUMN "uid" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "notes"          ADD COLUMN "uid" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "attachments"    ADD COLUMN "uid" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "meeting_series" ADD COLUMN "uid" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "meetings"       ADD COLUMN "uid" UUID NOT NULL DEFAULT gen_random_uuid();

-- 2. Every reference, translated to the referenced row's UUID.
ALTER TABLE "user_roles"     ADD COLUMN "user_uid" UUID;
ALTER TABLE "team_members"   ADD COLUMN "team_uid" UUID, ADD COLUMN "user_uid" UUID, ADD COLUMN "added_by_uid" UUID;
ALTER TABLE "teams"          ADD COLUMN "created_by_uid" UUID;
ALTER TABLE "projects"       ADD COLUMN "user_uid" UUID;
ALTER TABLE "notes"          ADD COLUMN "project_uid" UUID;
ALTER TABLE "attachments"    ADD COLUMN "note_uid" UUID;
ALTER TABLE "meeting_series" ADD COLUMN "team_uid" UUID, ADD COLUMN "created_by_uid" UUID;
ALTER TABLE "meetings"       ADD COLUMN "series_uid" UUID;
ALTER TABLE "note_meetings"  ADD COLUMN "note_uid" UUID, ADD COLUMN "meeting_uid" UUID;

UPDATE "user_roles" x     SET "user_uid" = u."uid" FROM "users" u WHERE u."id" = x."user_id";
UPDATE "team_members" x   SET "team_uid" = t."uid" FROM "teams" t WHERE t."id" = x."team_id";
UPDATE "team_members" x   SET "user_uid" = u."uid" FROM "users" u WHERE u."id" = x."user_id";
UPDATE "team_members" x   SET "added_by_uid" = u."uid" FROM "users" u WHERE u."id" = x."added_by";
UPDATE "teams" x          SET "created_by_uid" = u."uid" FROM "users" u WHERE u."id" = x."created_by";
UPDATE "projects" x       SET "user_uid" = u."uid" FROM "users" u WHERE u."id" = x."user_id";
UPDATE "notes" x          SET "project_uid" = p."uid" FROM "projects" p WHERE p."id" = x."project_id";
UPDATE "attachments" x    SET "note_uid" = n."uid" FROM "notes" n WHERE n."id" = x."note_id";
UPDATE "meeting_series" x SET "team_uid" = t."uid" FROM "teams" t WHERE t."id" = x."team_id";
UPDATE "meeting_series" x SET "created_by_uid" = u."uid" FROM "users" u WHERE u."id" = x."created_by";
UPDATE "meetings" x       SET "series_uid" = s."uid" FROM "meeting_series" s WHERE s."id" = x."series_id";
UPDATE "note_meetings" x  SET "note_uid" = n."uid" FROM "notes" n WHERE n."id" = x."note_id";
UPDATE "note_meetings" x  SET "meeting_uid" = m."uid" FROM "meetings" m WHERE m."id" = x."meeting_id";

-- 3. Image sources inside note content: "/api/attachments/<old id>" becomes "/api/attachments/<uuid>". An image
--    copied into another note points at the original attachment, so every note is searched, not only its own.
DO $$
DECLARE
  a RECORD;
BEGIN
  FOR a IN SELECT "id", "uid" FROM "attachments" LOOP
    UPDATE "notes"
       SET "content" = replace("content"::text, '"/api/attachments/' || a."id" || '"', '"/api/attachments/' || a."uid" || '"')::jsonb
     WHERE "content"::text LIKE '%"/api/attachments/' || a."id" || '"%';
  END LOOP;
END $$;

-- 4. Drop the old columns. Their foreign keys, primary keys and indexes go with them (CASCADE); the sequences
--    behind BIGSERIAL are owned by the id columns and are dropped too.
ALTER TABLE "user_roles"     DROP COLUMN "user_id" CASCADE;
ALTER TABLE "team_members"   DROP COLUMN "team_id" CASCADE, DROP COLUMN "user_id" CASCADE, DROP COLUMN "added_by" CASCADE;
ALTER TABLE "teams"          DROP COLUMN "created_by" CASCADE;
ALTER TABLE "projects"       DROP COLUMN "user_id" CASCADE;
ALTER TABLE "notes"          DROP COLUMN "project_id" CASCADE;
ALTER TABLE "attachments"    DROP COLUMN "note_id" CASCADE;
ALTER TABLE "meeting_series" DROP COLUMN "team_id" CASCADE, DROP COLUMN "created_by" CASCADE;
ALTER TABLE "meetings"       DROP COLUMN "series_id" CASCADE;
ALTER TABLE "note_meetings"  DROP COLUMN "note_id" CASCADE, DROP COLUMN "meeting_id" CASCADE;
ALTER TABLE "users"          DROP COLUMN "id" CASCADE;
ALTER TABLE "teams"          DROP COLUMN "id" CASCADE;
ALTER TABLE "projects"       DROP COLUMN "id" CASCADE;
ALTER TABLE "notes"          DROP COLUMN "id" CASCADE;
ALTER TABLE "attachments"    DROP COLUMN "id" CASCADE;
ALTER TABLE "meeting_series" DROP COLUMN "id" CASCADE;
ALTER TABLE "meetings"       DROP COLUMN "id" CASCADE;

-- 5. The new columns take the old names.
ALTER TABLE "users"          RENAME COLUMN "uid" TO "id";
ALTER TABLE "teams"          RENAME COLUMN "uid" TO "id";
ALTER TABLE "projects"       RENAME COLUMN "uid" TO "id";
ALTER TABLE "notes"          RENAME COLUMN "uid" TO "id";
ALTER TABLE "attachments"    RENAME COLUMN "uid" TO "id";
ALTER TABLE "meeting_series" RENAME COLUMN "uid" TO "id";
ALTER TABLE "meetings"       RENAME COLUMN "uid" TO "id";
ALTER TABLE "user_roles"     RENAME COLUMN "user_uid" TO "user_id";
ALTER TABLE "team_members"   RENAME COLUMN "team_uid" TO "team_id";
ALTER TABLE "team_members"   RENAME COLUMN "user_uid" TO "user_id";
ALTER TABLE "team_members"   RENAME COLUMN "added_by_uid" TO "added_by";
ALTER TABLE "teams"          RENAME COLUMN "created_by_uid" TO "created_by";
ALTER TABLE "projects"       RENAME COLUMN "user_uid" TO "user_id";
ALTER TABLE "notes"          RENAME COLUMN "project_uid" TO "project_id";
ALTER TABLE "attachments"    RENAME COLUMN "note_uid" TO "note_id";
ALTER TABLE "meeting_series" RENAME COLUMN "team_uid" TO "team_id";
ALTER TABLE "meeting_series" RENAME COLUMN "created_by_uid" TO "created_by";
ALTER TABLE "meetings"       RENAME COLUMN "series_uid" TO "series_id";
ALTER TABLE "note_meetings"  RENAME COLUMN "note_uid" TO "note_id";
ALTER TABLE "note_meetings"  RENAME COLUMN "meeting_uid" TO "meeting_id";

ALTER TABLE "user_roles"     ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "team_members"   ALTER COLUMN "team_id" SET NOT NULL, ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "projects"       ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "notes"          ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "attachments"    ALTER COLUMN "note_id" SET NOT NULL;
ALTER TABLE "meeting_series" ALTER COLUMN "team_id" SET NOT NULL;
ALTER TABLE "meetings"       ALTER COLUMN "series_id" SET NOT NULL;
ALTER TABLE "note_meetings"  ALTER COLUMN "note_id" SET NOT NULL, ALTER COLUMN "meeting_id" SET NOT NULL;

-- 6. Primary keys, unique keys and indexes, under their previous names.
ALTER TABLE "users"          ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");
ALTER TABLE "teams"          ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");
ALTER TABLE "projects"       ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");
ALTER TABLE "notes"          ADD CONSTRAINT "notes_pkey" PRIMARY KEY ("id");
ALTER TABLE "attachments"    ADD CONSTRAINT "attachments_pkey" PRIMARY KEY ("id");
ALTER TABLE "meeting_series" ADD CONSTRAINT "meeting_series_pkey" PRIMARY KEY ("id");
ALTER TABLE "meetings"       ADD CONSTRAINT "meetings_pkey" PRIMARY KEY ("id");
ALTER TABLE "user_roles"     ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id", "role");
ALTER TABLE "team_members"   ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id", "user_id");
ALTER TABLE "note_meetings"  ADD CONSTRAINT "note_meetings_pkey" PRIMARY KEY ("note_id", "meeting_id");

CREATE INDEX "team_members_user_id_idx" ON "team_members"("user_id");
CREATE INDEX "projects_user_id_idx" ON "projects"("user_id");
CREATE INDEX "notes_project_id_created_at_idx" ON "notes"("project_id", "created_at" DESC);
CREATE INDEX "attachments_note_id_idx" ON "attachments"("note_id");
CREATE INDEX "meeting_series_team_id_idx" ON "meeting_series"("team_id");
CREATE UNIQUE INDEX "meetings_series_id_meeting_date_key" ON "meetings"("series_id", "meeting_date");
CREATE UNIQUE INDEX "meetings_series_id_scheduled_date_key" ON "meetings"("series_id", "scheduled_date");
CREATE INDEX "note_meetings_meeting_id_idx" ON "note_meetings"("meeting_id");

-- 7. Foreign keys, with the same delete rules as before.
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meeting_series" ADD CONSTRAINT "meeting_series_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meeting_series" ADD CONSTRAINT "meeting_series_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "meeting_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "note_meetings" ADD CONSTRAINT "note_meetings_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "note_meetings" ADD CONSTRAINT "note_meetings_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------------------------------
-- Hand-written: what schema.prisma cannot express (dropped with the old columns above). Keep these.

-- At most one leader per team (the code guarantees at least one). A hand-over demotes first, then promotes.
CREATE UNIQUE INDEX "team_members_one_leader" ON "team_members" ("team_id") WHERE "role" = 'leader';

-- One person cannot have two projects with the same name, ignoring upper and lower case (owner decision 2026-11-20).
CREATE UNIQUE INDEX "projects_user_id_name_key" ON "projects" ("user_id", lower("name"));
