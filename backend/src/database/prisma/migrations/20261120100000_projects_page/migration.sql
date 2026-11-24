-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------------------------------------------------
-- Hand-written: what schema.prisma cannot express. Keep this when regenerating this file.

-- One person cannot have two projects with the same name, ignoring upper and lower case (owner decision 2026-11-20).
CREATE UNIQUE INDEX "projects_user_id_name_key" ON "projects" ("user_id", lower("name"));
