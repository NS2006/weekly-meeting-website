import { z } from 'zod';
import { idSchema } from '../../utils/ids.ts';
import { isCalendarDate } from '../../utils/dates.ts';

/** Meetings exist this many days ahead (today included); the job tops them up every hour. */
export const HORIZON_DAYS = 28;
/** How often the meetings job runs (it also runs once at start-up). */
export const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
/** A cap so a mistake or a script cannot fill a team with schedules. */
export const MAX_SERIES_PER_TEAM = 10;
/** Past meetings come in pages of this size ("Show more"). */
export const PAST_PAGE_SIZE = 20;
/** Home lists the meetings of the next two weeks, at most this many (owner, 2026-11-24: five). */
export const HOME_DAYS = 14;
export const HOME_LIMIT = 5;
/** The list of my upcoming meetings (a note's "Another meeting" picker) holds at most this many (4 weeks is far fewer). */
export const MY_UPCOMING_LIMIT = 200;
/** A meeting can be moved at most this far ahead. */
export const MOVE_MAX_DAYS = 365;
/** The "jump to" list holds this many meetings on each side of the one shown (more than two years of a weekly one). */
export const SCHEDULE_WINDOW = 120;
/** Caps for arranging a board: more people than a team holds, more notes than anyone links to one meeting. */
export const MAX_SPEAKERS = 500;
export const MAX_ARRANGED_NOTES = 200;

const id = idSchema;
const seriesName = z.string().trim().min(1).max(60);
/** ISO weekdays (Mon = 1 … Sun = 7), at least one, no repeats; stored sorted. */
const daysOfWeek = z
  .array(z.number().int().min(1).max(7))
  .min(1)
  .max(7)
  .refine((days) => new Set(days).size === days.length, { message: 'repeated day' })
  .transform((days) => [...days].sort((a, b) => a - b));
const calendarDate = z.string().refine(isCalendarDate, { message: 'not a date' });
/** Empty text clears the title. */
const title = z
  .string()
  .trim()
  .max(120)
  .nullable()
  .transform((value) => (value ? value : null));

export const IdParamsSchema = z.object({ id }).strict();
/** A team period: `${year}-${index}` (checked against the team's split in the service). */
/** A period's key: its first month and length in months (`2026-10-3m`); whether it fits the team's split is checked later. */
export const PeriodParamsSchema = z.object({ id, key: z.string().regex(/^\d{4}-\d{2}-\d{1,2}m$/) }).strict();

const distinctIds = (max: number) =>
  z
    .array(id)
    .min(1)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'repeated id' });

export const ArrangeSpeakersSchema = z.object({ userIds: distinctIds(MAX_SPEAKERS) }).strict();
export const ArrangeNotesSchema = z.object({ userId: id, noteIds: distinctIds(MAX_ARRANGED_NOTES) }).strict();
export const BoardNoteParamsSchema = z.object({ id, noteId: id }).strict();

export const CreateSeriesSchema = z.object({ name: seriesName, daysOfWeek }).strict();

export const UpdateSeriesSchema = z
  .object({ name: seriesName.optional(), daysOfWeek: daysOfWeek.optional(), active: z.boolean().optional() })
  .strict()
  .refine((b) => b.name !== undefined || b.daysOfWeek !== undefined || b.active !== undefined, {
    message: 'nothing to change',
  });

export const TeamMeetingsQuerySchema = z
  .object({
    when: z.enum(['upcoming', 'past']).default('upcoming'),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .strict();

export const MyMeetingsQuerySchema = z
  .object({
    when: z.enum(['upcoming', 'past']).default('upcoming'),
    teamId: id.optional(),
    status: z.enum(['scheduled', 'cancelled', 'done']).optional(),
    q: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((value) => (value ? value : undefined)),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .strict()
  .refine((query) => !query.from || !query.to || query.from <= query.to, { message: 'from is after to', path: ['from'] });

export const UpdateMeetingSchema = z
  .object({
    title: title.optional(),
    status: z.enum(['scheduled', 'cancelled']).optional(),
    date: calendarDate.optional(),
  })
  .strict()
  .refine((b) => b.title !== undefined || b.status !== undefined || b.date !== undefined, {
    message: 'nothing to change',
  });
