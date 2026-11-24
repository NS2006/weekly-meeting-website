-- The board's order (owner decision 2026-11-23): a meeting's speaking order, set by the team's leader, and the order
-- of one person's notes on a meeting, set by that person or the leader. Both are optional: without them the board
-- keeps its default order (leader, then by name; notes newest first).

-- AlterTable
ALTER TABLE "note_meetings" ADD COLUMN     "position" INTEGER;

-- CreateTable
CREATE TABLE "meeting_speakers" (
    "meeting_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "meeting_speakers_pkey" PRIMARY KEY ("meeting_id","user_id")
);

-- AddForeignKey
ALTER TABLE "meeting_speakers" ADD CONSTRAINT "meeting_speakers_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_speakers" ADD CONSTRAINT "meeting_speakers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written (Prisma does not model CHECK constraints).
ALTER TABLE "note_meetings" ADD CONSTRAINT "note_meetings_position_check" CHECK ("position" IS NULL OR "position" >= 0);
ALTER TABLE "meeting_speakers" ADD CONSTRAINT "meeting_speakers_position_check" CHECK ("position" >= 0);
