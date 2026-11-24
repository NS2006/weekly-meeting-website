-- AlterTable
ALTER TABLE "team_members" ADD COLUMN     "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "added_by" BIGINT;

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "archived_at" TIMESTAMPTZ(6),
ADD COLUMN     "created_by" BIGINT,
ADD COLUMN     "description" TEXT;

-- CreateIndex
CREATE INDEX "teams_archived_at_idx" ON "teams"("archived_at");

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------------------------------
-- Hand-written: what schema.prisma cannot express. Keep this when regenerating this file.

-- At most one leader per team (the code guarantees at least one). A hand-over demotes first, then promotes.
CREATE UNIQUE INDEX "team_members_one_leader" ON "team_members" ("team_id") WHERE "role" = 'leader';
