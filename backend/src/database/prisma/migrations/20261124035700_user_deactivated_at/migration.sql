-- When an admin last deactivated a user (owner, 2026-11-24): an inactive user who signed in after it, or was never
-- deactivated, is waiting for access. Existing rows start empty: everyone inactive today counts as waiting.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deactivated_at" TIMESTAMPTZ(6);
