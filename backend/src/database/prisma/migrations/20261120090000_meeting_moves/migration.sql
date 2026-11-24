-- Meetings can be moved to another day: meeting_date is when it happens, scheduled_date the day its series put it
-- on (the generator's key, so a moved or cancelled meeting is never generated again).

-- AlterTable: add the column, copy the existing dates into it, then make it required.
ALTER TABLE "meetings" ADD COLUMN     "scheduled_date" DATE;
UPDATE "meetings" SET "scheduled_date" = "meeting_date";
ALTER TABLE "meetings" ALTER COLUMN "scheduled_date" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "meetings_series_id_scheduled_date_key" ON "meetings"("series_id", "scheduled_date");
