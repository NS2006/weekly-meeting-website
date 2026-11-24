-- How each team splits its year (owner decision 2026-11-23): 4 quarters from January unless its leader changes it.
-- Periods are computed from these two numbers; nothing else is stored per period.

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "periods_per_year" SMALLINT NOT NULL DEFAULT 4,
ADD COLUMN     "year_start_month" SMALLINT NOT NULL DEFAULT 1;

-- Hand-written (Prisma does not model CHECK constraints): parts that divide the year into whole months.
ALTER TABLE "teams" ADD CONSTRAINT "teams_periods_per_year_check" CHECK ("periods_per_year" IN (1, 2, 3, 4, 6, 12));
ALTER TABLE "teams" ADD CONSTRAINT "teams_year_start_month_check" CHECK ("year_start_month" BETWEEN 1 AND 12);
